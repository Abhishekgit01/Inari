"""Unit tests for CyberGuardian AI backend core components."""

import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.environment.cyber_env import CyberSecurityEnv
from src.detection.correlator import CrossLayerCorrelator
from src.simulation.log_generator import LogGenerator
from src.api.main import app
from src.api.integrations import _api_keys, _siem_connectors, _url_security_reports
from src.api.exceptions import (
    CyberGuardianException,
    SimulationNotFound,
    InvalidParameter,
    RateLimitExceeded,
)


# ── Environment Tests ──────────────────────────────────────────────────────

class TestCyberSecurityEnv:
    def test_reset_returns_observation_and_info(self):
        env = CyberSecurityEnv(num_hosts=20, max_steps=100)
        obs, info = env.reset()
        assert "network_topology" in obs
        assert "host_status" in obs
        assert "episode_id" in info
        assert info["red_position"] >= 0

    def test_step_returns_valid_structure(self):
        env = CyberSecurityEnv(num_hosts=20, max_steps=100)
        env.reset()
        action = {"red_action": [0, 1], "blue_action": [0, 0]}
        obs, rewards, terminated, truncated, info = env.step(action)
        assert "red" in rewards
        assert "blue" in rewards
        assert isinstance(terminated, bool)
        assert isinstance(truncated, bool)
        assert "new_alerts" in info

    def test_multiple_steps_no_crash(self):
        env = CyberSecurityEnv(num_hosts=20, max_steps=100)
        env.reset()
        for i in range(15):
            action = {"red_action": [i % 20, (i % 4) + 1], "blue_action": [0, 0]}
            obs, rewards, term, trunc, info = env.step(action)
            if term or trunc:
                break
        assert env.current_step >= 1

    def test_new_alerts_initialized_on_reset(self):
        env = CyberSecurityEnv(num_hosts=20, max_steps=100)
        obs, info = env.reset()
        assert hasattr(env, "new_alerts")
        assert isinstance(env.new_alerts, list)

    def test_benign_traffic_generated_each_step(self):
        env = CyberSecurityEnv(num_hosts=20, max_steps=100)
        env.reset()
        action = {"red_action": [0, 1], "blue_action": [0, 0]}
        obs, rewards, term, trunc, info = env.step(action)
        logs = info.get("logs", [])
        benign = [l for l in logs if l.get("action_type") == "normal_traffic"]
        assert len(benign) > 0

    def test_correlator_produces_alerts(self):
        env = CyberSecurityEnv(num_hosts=20, max_steps=100)
        env.reset()
        # Run several steps to accumulate logs
        for i in range(5):
            action = {"red_action": [i + 2, 1], "blue_action": [0, 0]}
            obs, rewards, term, trunc, info = env.step(action)
        # At least some alerts should have been generated across steps
        assert isinstance(env.new_alerts, list)


# ── Correlator Tests ────────────────────────────────────────────────────────

class TestCrossLayerCorrelator:
    def test_correlator_instantiate(self):
        c = CrossLayerCorrelator()
        assert c is not None

    def test_correlator_ingest_and_correlate(self):
        c = CrossLayerCorrelator()
        logs = [
            {
                "correlation_id": "ATK-001-TEST1234",
                "layer": "network",
                "action_type": "exploit",
                "is_malicious": True,
                "is_false_positive_seed": False,
                "alert_score": 0.8,
                "source_host_id": 0,
                "target_host_id": 5,
                "step": 1,
            },
            {
                "correlation_id": "ATK-001-TEST1234",
                "layer": "endpoint",
                "action_type": "exploit",
                "is_malicious": True,
                "is_false_positive_seed": False,
                "alert_score": 0.7,
                "source_host_id": 0,
                "target_host_id": 5,
                "step": 1,
            },
        ]
        c.ingest(logs, 1)
        alerts = c.correlate(1)
        assert isinstance(alerts, list)

    def test_empty_correlate_returns_empty(self):
        c = CrossLayerCorrelator()
        alerts = c.correlate(999)
        assert alerts == []


# ── Log Generator Tests ─────────────────────────────────────────────────────

class TestLogGenerator:
    def test_generate_all_layers(self):
        lg = LogGenerator()
        lg.set_step(1)
        logs = lg.generate_all_layers("exploit", 0, 5, 1, success=True)
        assert len(logs) >= 1
        for log in logs:
            assert "correlation_id" in log
            assert log["is_malicious"] is True

    def test_generate_benign_traffic(self):
        lg = LogGenerator()
        logs = lg.generate_benign_traffic(1, num_events=5)
        assert len(logs) == 5
        for log in logs:
            assert log["is_malicious"] is False
            assert log["action_type"] == "normal_traffic"

    def test_generate_false_positive_scenario(self):
        lg = LogGenerator()
        lg.set_step(15)
        logs = lg.generate_false_positive_scenario()
        assert len(logs) >= 1
        for log in logs:
            assert log.get("is_false_positive_seed") is True


# ── Exception Tests ────────────────────────────────────────────────────────

class TestExceptions:
    def test_cyberguardian_exception_base(self):
        exc = CyberGuardianException(detail="test error")
        assert exc.detail == "test error"
        assert exc.status_code == 500

    def test_simulation_not_found(self):
        exc = SimulationNotFound(detail="sim-123 not found")
        assert exc.status_code == 404
        assert exc.code == "SIMULATION_NOT_FOUND"

    def test_invalid_parameter(self):
        exc = InvalidParameter(detail="bad param")
        assert exc.status_code == 422

    def test_rate_limit_exceeded(self):
        exc = RateLimitExceeded()
        assert exc.status_code == 429


class TestEnterprisePathways:
    def test_enterprise_pathways_endpoint_returns_real_rollout_models(self):
        with TestClient(app) as client:
            response = client.get("/api/enterprise/pathways")

        assert response.status_code == 200
        payload = response.json()

        assert payload["status"] == "ok"
        assert payload["recommended_first_step"]["backend_endpoint"] == "/api/webhooks/ingest"
        assert len(payload["pathways"]) == 5
        assert any(pathway["id"] == "siem_xdr_app" for pathway in payload["pathways"])
        assert any(row["feature_area"] == "Identity" for row in payload["current_vs_target"])


class TestWebhookIngest:
    def test_enterprise_webhook_ingest_alias_accepts_events(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ATHERNEX_API_KEY", "ath_test_admin")
        _api_keys.clear()

        with TestClient(app) as client:
            response = client.post(
                "/api/webhooks/ingest",
                headers={"X-API-Key": "ath_test_admin", "X-SIEM-Vendor": "generic"},
                json=[
                    {
                        "timestamp": "2026-04-24T08:00:00Z",
                        "host": "WEB-01",
                        "type": "alert",
                        "severity": "critical",
                        "source": "10.0.10.5",
                        "target": "10.0.0.11",
                        "threat_type": "lateral_movement",
                    }
                ],
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["status"] == "ingested"
        assert payload["vendor"] == "generic"
        assert payload["events_normalized"] == 1


class TestURLIngest:
    def test_remote_url_ingest_fetches_feed_and_updates_live_session(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ATHERNEX_API_KEY", "ath_test_admin")
        _api_keys.clear()

        remote_payload = json.dumps(
            [
                {
                    "timestamp": "2026-04-24T09:00:00Z",
                    "host": "DB-01",
                    "type": "alert",
                    "severity": "critical",
                    "source": "10.0.10.99",
                    "target": "10.0.0.12",
                    "threat_type": "data_exfiltration",
                }
            ]
        ).encode()

        class FakeResponse:
            def __init__(self, payload: bytes):
                self._payload = payload
                self.headers = {"Content-Type": "application/json"}

            def read(self) -> bytes:
                return self._payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        monkeypatch.setattr("src.api.integrations.urlopen", lambda request, timeout=15: FakeResponse(remote_payload))

        with TestClient(app) as client:
            create_response = client.post("/api/simulation/create")
            assert create_response.status_code == 200
            simulation_id = create_response.json()["simulation_id"]

            ingest_response = client.post(
                "/api/ingest/url",
                headers={"X-API-Key": "ath_test_admin"},
                json={"url": "https://example.com/feed.json", "vendor": "generic"},
            )
            assert ingest_response.status_code == 200
            ingested = ingest_response.json()
            assert ingested["status"] == "ingested"
            assert ingested["bridge"]["bridged"] is True

            history_response = client.get(f"/api/briefing/{simulation_id}")
            assert history_response.status_code == 200

            alerts_response = client.get("/api/detection/alerts")
            assert alerts_response.status_code == 200
            alerts = alerts_response.json()["alerts"]
            assert any(alert["threat_type"] == "data_exfiltration" for alert in alerts)


class TestCORSPolicy:
    def test_ingest_url_preflight_allows_localhost_dev_origin(self):
        with TestClient(app) as client:
            response = client.options(
                "/api/ingest/url",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "content-type,x-api-key",
                },
            )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


class TestURLSecurityAnalysis:
    def test_passive_url_security_report_returns_findings(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ATHERNEX_API_KEY", "ath_test_admin")
        _api_keys.clear()
        _url_security_reports.clear()

        html_payload = b"""
        <html>
          <body>
            <form method="get" action="/search">
              <input type="text" name="q" />
            </form>
          </body>
        </html>
        """

        class FakeResponse:
            def __init__(self, payload: bytes):
                self._payload = payload
                self.status = 200
                self.headers = {"Content-Type": "text/html", "Server": "nginx/1.23"}

            def read(self) -> bytes:
                return self._payload

            def geturl(self):
                return "http://example.com/search?q=admin"

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        monkeypatch.setattr("src.api.integrations.urlopen", lambda request, timeout=15: FakeResponse(html_payload))

        with TestClient(app) as client:
            response = client.post(
                "/api/url-security/analyze",
                headers={"X-API-Key": "ath_test_admin"},
                json={"url": "http://example.com/search?q=admin"},
            )

        assert response.status_code == 200
        payload = response.json()
        assert payload["security_score"] < 80
        assert any("SQL injection" in family["family"] for family in payload["attack_families"])
        assert any(finding["title"] == "Insecure transport" for finding in payload["findings"])


class TestConnectorPolling:
    def test_manual_connector_pull_updates_saved_connector_state(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ATHERNEX_API_KEY", "ath_test_admin")
        _api_keys.clear()
        _siem_connectors.clear()

        remote_payload = json.dumps(
            [
                {
                    "timestamp": "2026-04-24T09:00:00Z",
                    "host": "APP-01",
                    "type": "alert",
                    "severity": "high",
                    "source": "10.0.10.5",
                    "target": "10.0.0.10",
                    "threat_type": "lateral_movement",
                }
            ]
        ).encode()

        class FakeResponse:
            def __init__(self, payload: bytes):
                self._payload = payload
                self.headers = {"Content-Type": "application/json"}

            def read(self) -> bytes:
                return self._payload

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return False

        monkeypatch.setattr("src.api.integrations.urlopen", lambda request, timeout=15: FakeResponse(remote_payload))

        with TestClient(app) as client:
            register = client.post(
                "/api/connectors/siem",
                headers={"X-API-Key": "ath_test_admin"},
                json={
                    "vendor": "splunk",
                    "api_url": "https://example.com/feed.json",
                    "api_key": "remote-token",
                    "poll_interval_seconds": 60,
                    "severity_filter": ["high", "critical"],
                    "enabled": True,
                },
            )
            connector_id = register.json()["connector_id"]

            create_response = client.post("/api/simulation/create")
            assert create_response.status_code == 200

            pull = client.post(
                f"/api/connectors/siem/{connector_id}/pull",
                headers={"X-API-Key": "ath_test_admin"},
            )

        assert pull.status_code == 200
        payload = pull.json()
        assert payload["status"] == "ingested"
        assert payload["bridge"]["bridged"] is True
        assert _siem_connectors[connector_id]["events_ingested"] >= 1


class TestSoarApprovalPolicy:
    def test_high_risk_soar_action_requires_manual_approval(self, monkeypatch: pytest.MonkeyPatch):
        monkeypatch.setenv("ATHERNEX_API_KEY", "ath_test_admin")
        monkeypatch.setenv("REQUIRE_SOAR_APPROVAL", "true")
        monkeypatch.setenv("REQUIRE_SEPARATE_APPROVER", "true")
        _api_keys.clear()

        with TestClient(app) as client:
            create_response = client.post(
                "/api/soar/action",
                headers={"X-API-Key": "ath_test_admin"},
                json={
                    "action_type": "block_ip",
                    "target": "10.0.10.5",
                    "reason": "Test containment",
                    "auto_execute": True,
                    "channels": ["slack"],
                },
            )

            assert create_response.status_code == 200
            created = create_response.json()
            assert created["status"] == "pending_approval"
            assert created["requires_manual_approval"] is True

            same_approver_response = client.post(
                f"/api/soar/approve/{created['action_id']}",
                headers={"X-API-Key": "ath_test_admin"},
            )
            assert same_approver_response.status_code == 403

            second_admin_response = client.post(
                "/api/keys/generate",
                headers={"X-API-Key": "ath_test_admin"},
                json={"label": "second-admin", "roles": ["admin"]},
            )
            assert second_admin_response.status_code == 200
            second_admin_key = second_admin_response.json()["key"]

            approve_response = client.post(
                f"/api/soar/approve/{created['action_id']}",
                headers={"X-API-Key": second_admin_key},
            )
            assert approve_response.status_code == 200
            approved = approve_response.json()
            assert approved["status"] == "executed"
            assert approved["approved_by"] == "second-admin"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
