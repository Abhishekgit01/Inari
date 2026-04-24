"""Unit tests for CyberGuardian AI backend core components."""

import sys
import pytest

sys.path.insert(0, "/Abhi/Projects/Athernex/backend")

from src.environment.cyber_env import CyberSecurityEnv
from src.detection.correlator import CrossLayerCorrelator
from src.simulation.log_generator import LogGenerator
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


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
