# CyberGuardian AI - Project Improvements Implementation Design

## Overview

This design document outlines the comprehensive improvements to be implemented across the CyberGuardian AI project. The improvements are organized into 10 major areas and will be implemented in a phased approach to ensure stability and maintainability.

**Key Principle**: All improvements will be implemented as NEW code alongside the existing codebase, without modifying existing functionality. This ensures backward compatibility and allows for gradual migration.

---

## 1. Architecture & Infrastructure Design

### 1.1 Microservices Architecture

**Target Structure:**
```
cyberguardian/
├── api-gateway/           # FastAPI gateway with rate limiting
│   ├── src/
│   │   ├── main.py
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── config/
│   ├── Dockerfile
│   └── requirements.txt
├── simulation-service/    # RL environment & agent execution
│   ├── src/
│   │   ├── environment/
│   │   ├── agents/
│   │   └── api/
│   ├── Dockerfile
│   └── requirements.txt
├── detection-service/     # Threat detection pipeline
│   ├── src/
│   │   ├── detection/
│   │   ├── models/
│   │   └── api/
│   ├── Dockerfile
│   └── requirements.txt
├── analytics-service/     # Kill chain, APT attribution
│   ├── src/
│   │   ├── analytics/
│   │   ├── kill_chain/
│   │   └── api/
│   ├── Dockerfile
│   └── requirements.txt
├── training-service/      # Self-play training
│   ├── src/
│   │   ├── training/
│   │   ├── self_play/
│   │   └── api/
│   ├── Dockerfile
│   └── requirements.txt
├── frontend-service/      # React SPA
│   ├── src/
│   ├── public/
│   ├── Dockerfile
│   └── package.json
└── shared-libs/          # Common models, utilities
    ├── models/
    ├── utils/
    └── constants/
```

**Implementation Strategy:**
- Create new service directories alongside existing `backend/` directory
- Implement API Gateway as entry point for all services
- Use Docker Compose for local development
- Prepare Kubernetes manifests for production deployment

### 1.2 Database Architecture

**PostgreSQL Schema:**
```sql
-- New tables for enhanced functionality
CREATE TABLE simulations (
    id UUID PRIMARY KEY,
    config JSONB NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE network_states (
    id UUID PRIMARY KEY,
    simulation_id UUID REFERENCES simulations(id),
    step_number INTEGER NOT NULL,
    state_data JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE detection_events (
    id UUID PRIMARY KEY,
    simulation_id UUID REFERENCES simulations(id),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    details JSONB NOT NULL,
    detected_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE agent_actions (
    id UUID PRIMARY KEY,
    simulation_id UUID REFERENCES simulations(id),
    agent_type VARCHAR(20) NOT NULL,
    action_type VARCHAR(100) NOT NULL,
    action_data JSONB NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE model_versions (
    id UUID PRIMARY KEY,
    model_name VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    metrics JSONB NOT NULL,
    model_path TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_simulations_status ON simulations(status);
CREATE INDEX idx_network_states_simulation ON network_states(simulation_id, step_number);
CREATE INDEX idx_detection_events_simulation ON detection_events(simulation_id);
CREATE INDEX idx_agent_actions_simulation ON agent_actions(simulation_id, timestamp);
```

**Redis Cache Structure:**
```
# Cache keys
simulation:{id}:state          # Current network state
simulation:{id}:metrics        # Real-time metrics
agent:{type}:model             # Cached model weights
detection:results:{id}         # Detection results cache
```

### 1.3 Observability Stack

**Logging Architecture:**
```python
# Structured logging configuration
{
    "version": 1,
    "formatters": {
        "json": {
            "class": "pythonjsonlogger.jsonlogger.JsonFormatter",
            "format": "%(timestamp)s %(level)s %(name)s %(message)s"
        }
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "json"
        }
    },
    "root": {
        "level": "INFO",
        "handlers": ["console"]
    }
}
```

**Metrics Collection:**
- Prometheus metrics endpoint at `/metrics` for each service
- Grafana dashboards for visualization
- AlertManager for critical alerts

**Distributed Tracing:**
- OpenTelemetry instrumentation for all services
- Jaeger for trace collection and visualization
- Correlation IDs for request tracking

---

## 2. Backend Service Designs

### 2.1 API Gateway Service

**Interface Design:**
```python
# api-gateway/src/main.py
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.util import get_remote_address

app = FastAPI(
    title="CyberGuardian API Gateway",
    version="2.0.0",
    description="Unified API Gateway for CyberGuardian services"
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://cyberguardian.ai"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)

# Health check
@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "api-gateway"}

# Service routing
@app.api_route("/api/v2/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
async def route_to_service(request: Request, path: str):
    # Route to appropriate microservice
    pass
```

**Service Registry:**
```python
# api-gateway/src/config/services.py
SERVICE_REGISTRY = {
    "simulation": {
        "url": "http://simulation-service:8001",
        "health": "/health",
        "prefix": "/api/v2/simulation"
    },
    "detection": {
        "url": "http://detection-service:8002",
        "health": "/health",
        "prefix": "/api/v2/detection"
    },
    "analytics": {
        "url": "http://analytics-service:8003",
        "health": "/health",
        "prefix": "/api/v2/analytics"
    },
    "training": {
        "url": "http://training-service:8004",
        "health": "/health",
        "prefix": "/api/v2/training"
    }
}
```

### 2.2 Simulation Service

**Enhanced Environment Interface:**
```python
# simulation-service/src/environment/configurable_env.py
from pydantic import BaseModel, Field
from typing import Literal, Dict, List, Tuple

class NetworkConfig(BaseModel):
    """Configurable network topology"""
    num_hosts: int = Field(20, ge=5, le=100)
    topology_type: Literal["star", "mesh", "hierarchical", "custom"]
    zones: Dict[str, List[int]]  # DMZ, APP, DB, WORKSTATION
    connectivity_rules: List[Tuple[int, int, float]]
    data_distribution: Dict[int, float]

class RewardConfig(BaseModel):
    """Enhanced reward function configuration"""
    weights: Dict[str, float]  # w_p, w_t, w_d, w_fp
    shaping_rewards: bool = True
    sparse_rewards: bool = False
    curriculum_learning: bool = True

class ExtendedActionSpace(BaseModel):
    """Extended action space for both agents"""
    # Red actions
    social_engineering: int
    zero_day_exploit: int
    ransomware: int
    supply_chain: int
    
    # Blue actions
    deception: int
    threat_hunting: int
    threat_intel: int
    incident_response: int

class ConfigurableCyberEnv:
    """Enhanced RL environment with configurable parameters"""
    
    def __init__(self, config: NetworkConfig, reward_config: RewardConfig):
        self.config = config
        self.reward_config = reward_config
        self.action_space = ExtendedActionSpace()
        
    def reset(self) -> Tuple[Dict, Dict]:
        """Reset environment with new configuration"""
        pass
        
    def step(self, action: Dict) -> Tuple[Dict, float, bool, Dict]:
        """Execute step with enhanced reward calculation"""
        pass
```

### 2.3 Detection Service

**ML-Based Detection Interface:**
```python
# detection-service/src/detection/ml_detector.py
from typing import Dict, List
import pandas as pd
from sklearn.ensemble import IsolationForest
import xgboost as xgb

class MLDetector:
    """Machine learning-based threat detection"""
    
    def __init__(self):
        self.models = {
            "anomaly": IsolationForest(contamination=0.1),
            "classification": xgb.XGBClassifier(),
            # Additional models can be added
        }
        self.feature_engineer = FeatureEngineer()
        
    def train(self, data: pd.DataFrame, labels: pd.Series = None):
        """Train detection models"""
        pass
        
    def detect(self, network_state: Dict) -> List[Dict]:
        """Detect threats in network state"""
        features = self.feature_engineer.extract_features(network_state)
        predictions = {}
        for model_name, model in self.models.items():
            predictions[model_name] = model.predict(features)
        return self._aggregate_predictions(predictions)
        
    def _aggregate_predictions(self, predictions: Dict) -> List[Dict]:
        """Aggregate predictions from multiple models"""
        pass

class FeatureEngineer:
    """Feature extraction for detection models"""
    
    def extract_features(self, network_state: Dict) -> pd.DataFrame:
        """Extract temporal, statistical, behavioral features"""
        features = {
            "temporal": self._extract_temporal_features(network_state),
            "statistical": self._extract_statistical_features(network_state),
            "behavioral": self._extract_behavioral_features(network_state)
        }
        return pd.DataFrame(features)
```

### 2.4 Analytics Service

**Kill Chain Analysis Interface:**
```python
# analytics-service/src/kill_chain/analyzer.py
from typing import Dict, List
from enum import Enum

class KillChainStage(Enum):
    RECONNAISSANCE = "reconnaissance"
    WEAPONIZATION = "weaponization"
    DELIVERY = "delivery"
    EXPLOITATION = "exploitation"
    INSTALLATION = "installation"
    COMMAND_AND_CONTROL = "command_and_control"
    ACTIONS_ON_OBJECTIVES = "actions_on_objectives"

class KillChainAnalyzer:
    """Analyze attack progression through kill chain stages"""
    
    def __init__(self):
        self.stage_indicators = self._load_stage_indicators()
        
    def analyze(self, simulation_id: str) -> Dict:
        """Analyze kill chain progression"""
        actions = self._fetch_agent_actions(simulation_id)
        stages = self._map_actions_to_stages(actions)
        return {
            "current_stage": self._identify_current_stage(stages),
            "stage_progression": stages,
            "time_in_stage": self._calculate_time_in_stage(stages),
            "attribution": self._attribute_attack_pattern(stages)
        }
        
    def _map_actions_to_stages(self, actions: List[Dict]) -> Dict[KillChainStage, List]:
        """Map agent actions to kill chain stages"""
        pass
```

### 2.5 Training Service

**Advanced Training Interface:**
```python
# training-service/src/training/advanced_trainer.py
from typing import Dict, Optional
import optuna

class AdvancedTrainer:
    """Advanced RL training with multiple algorithms"""
    
    def __init__(self):
        self.algorithms = {
            "ppo": PPO2,
            "sac": SAC,
            "td3": TD3,
            "rainbow": RainbowDQN,
        }
        
    def train_with_curriculum(
        self, 
        algorithm: str, 
        env_config: Dict,
        num_levels: int = 10
    ) -> Dict:
        """Progressive difficulty scaling training"""
        results = []
        for level in range(1, num_levels + 1):
            env_config["difficulty"] = level
            env = self._create_env(env_config)
            agent = self._create_agent(algorithm, env)
            metrics = agent.train(env, steps=10000)
            results.append({
                "level": level,
                "metrics": metrics
            })
        return results
        
    def optimize_hyperparameters(
        self, 
        algorithm: str, 
        env_config: Dict,
        n_trials: int = 100
    ) -> Dict:
        """Bayesian optimization for hyperparameters"""
        study = optuna.create_study(direction="maximize")
        study.optimize(
            lambda trial: self._objective(trial, algorithm, env_config),
            n_trials=n_trials
        )
        return study.best_params
```

---

## 3. Frontend Service Design

### 3.1 State Management Architecture

**Zustand Store Design:**
```typescript
// frontend-service/src/stores/simulationStore.ts
import { create } from 'zustand';

interface SimulationState {
  currentSimulation: Simulation | null;
  networkGraph: NetworkGraph;
  alerts: Alert[];
  playbooks: Playbook[];
  isLoading: boolean;
  
  // Actions
  startSimulation: (config: SimulationConfig) => Promise<void>;
  stepSimulation: () => Promise<void>;
  resetSimulation: () => Promise<void>;
  fetchAlerts: (filters: AlertFilters) => Promise<void>;
}

export const useSimulationStore = create<SimulationState>((set, get) => ({
  currentSimulation: null,
  networkGraph: { nodes: [], edges: [] },
  alerts: [],
  playbooks: [],
  isLoading: false,
  
  startSimulation: async (config) => {
    set({ isLoading: true });
    try {
      const response = await fetch('/api/v2/simulation/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const simulation = await response.json();
      set({ currentSimulation: simulation, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },
  
  stepSimulation: async () => {
    const { currentSimulation } = get();
    if (!currentSimulation) return;
    
    const response = await fetch(`/api/v2/simulation/${currentSimulation.id}/step`, {
      method: 'POST'
    });
    const state = await response.json();
    set({ networkGraph: state.networkGraph });
  },
  
  resetSimulation: async () => {
    const { currentSimulation } = get();
    if (!currentSimulation) return;
    
    await fetch(`/api/v2/simulation/${currentSimulation.id}/reset`, {
      method: 'POST'
    });
    set({ currentSimulation: null, networkGraph: { nodes: [], edges: [] } });
  },
  
  fetchAlerts: async (filters) => {
    const params = new URLSearchParams(filters as any);
    const response = await fetch(`/api/v2/detection/alerts?${params}`);
    const alerts = await response.json();
    set({ alerts });
  }
}));
```

### 3.2 Component Library

**Reusable Component Interfaces:**
```typescript
// frontend-service/src/components/NetworkGraph/types.ts
export interface NetworkGraphProps {
  nodes: Node[];
  edges: Edge[];
  onNodeClick?: (node: Node) => void;
  onEdgeClick?: (edge: Edge) => void;
  highlightPath?: number[];
  animationSpeed?: number;
}

export interface Node {
  id: number;
  label: string;
  type: 'server' | 'workstation' | 'router' | 'firewall';
  status: 'healthy' | 'compromised' | 'isolated';
  position: { x: number; y: number; z: number };
  data?: any;
}

export interface Edge {
  id: string;
  source: number;
  target: number;
  type: 'network' | 'attack' | 'defense';
  weight: number;
}

// frontend-service/src/components/ThreatRadar/types.ts
export interface ThreatRadarProps {
  threats: Threat[];
  radius: number;
  onThreatSelect?: (threat: Threat) => void;
  updateInterval?: number;
}

export interface Threat {
  id: string;
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  position: { angle: number; distance: number };
  timestamp: Date;
}
```

### 3.3 Real-time Dashboard

**WebSocket Integration:**
```typescript
// frontend-service/src/hooks/useRealTimeMetrics.ts
import { useEffect, useState } from 'react';

interface RealTimeMetrics {
  detectionRate: number;
  fpRate: number;
  responseTime: number;
  activeThreats: number;
}

export function useRealTimeMetrics(simulationId: string | null) {
  const [metrics, setMetrics] = useState<RealTimeMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  useEffect(() => {
    if (!simulationId) return;
    
    const ws = new WebSocket(`wss://api.cyberguardian.ai/ws/metrics/${simulationId}`);
    
    ws.onopen = () => setIsConnected(true);
    ws.onclose = () => setIsConnected(false);
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(data);
    };
    
    return () => ws.close();
  }, [simulationId]);
  
  return { metrics, isConnected };
}
```

---

## 4. Security Design

### 4.1 Authentication & Authorization

**JWT-Based Authentication:**
```python
# shared-libs/auth/jwt_handler.py
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext

class AuthHandler:
    """JWT authentication handler"""
    
    def __init__(self, secret_key: str, algorithm: str = "HS256"):
        self.secret_key = secret_key
        self.algorithm = algorithm
        self.pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        
    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(hours=24)
        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm=self.algorithm)
        return encoded_jwt
        
    def verify_token(self, token: str) -> Optional[dict]:
        try:
            payload = jwt.decode(token, self.secret_key, algorithms=[self.algorithm])
            return payload
        except JWTError:
            return None
            
    def hash_password(self, password: str) -> str:
        return self.pwd_context.hash(password)
        
    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        return self.pwd_context.verify(plain_password, hashed_password)
```

**Role-Based Access Control:**
```python
# shared-libs/auth/rbac.py
from enum import Enum
from typing import List

class Role(str, Enum):
    VIEWER = "viewer"
    ANALYST = "analyst"
    ADMIN = "admin"

class Permission(str, Enum):
    READ = "read"
    WRITE = "write"
    DELETE = "delete"
    EXECUTE = "execute"

ROLE_PERMISSIONS = {
    Role.VIEWER: [Permission.READ],
    Role.ANALYST: [Permission.READ, Permission.WRITE],
    Role.ADMIN: [Permission.READ, Permission.WRITE, Permission.DELETE, Permission.EXECUTE]
}

def check_permission(role: Role, required_permission: Permission) -> bool:
    """Check if role has required permission"""
    return required_permission in ROLE_PERMISSIONS.get(role, [])
```

### 4.2 Input Validation

**Pydantic Models for Validation:**
```python
# shared-libs/models/requests.py
from pydantic import BaseModel, Field, validator
from typing import Literal, Optional

class SimulationRequest(BaseModel):
    """Validated simulation creation request"""
    num_hosts: int = Field(20, ge=5, le=100, description="Number of hosts in network")
    max_steps: int = Field(100, ge=10, le=1000, description="Maximum simulation steps")
    scenario: Literal["easy", "medium", "hard", "expert"] = "medium"
    topology_type: Literal["star", "mesh", "hierarchical", "custom"] = "star"
    
    @validator('num_hosts')
    def validate_hosts(cls, v):
        if v % 5 != 0:
            raise ValueError("num_hosts must be multiple of 5")
        return v

class DetectionRequest(BaseModel):
    """Validated detection analysis request"""
    simulation_id: str
    time_range: Optional[int] = Field(3600, ge=60, le=86400)
    severity_filter: Optional[List[str]] = ["low", "medium", "high", "critical"]
```

### 4.3 Rate Limiting

**Rate Limit Configuration:**
```python
# api-gateway/src/config/rate_limits.py
RATE_LIMITS = {
    "default": "100/minute",
    "simulation_create": "10/minute",
    "simulation_step": "60/minute",
    "detection_analyze": "30/minute",
    "training_start": "5/hour",
    "auth_login": "10/minute",
    "auth_refresh": "20/minute"
}

def get_rate_limit(endpoint: str) -> str:
    """Get rate limit for specific endpoint"""
    return RATE_LIMITS.get(endpoint, RATE_LIMITS["default"])
```

---

## 5. Performance Design

### 5.1 Caching Strategy

**Redis Cache Implementation:**
```python
# shared-libs/cache/redis_cache.py
import redis
import json
from typing import Optional, Any
from functools import wraps

class RedisCache:
    """Redis caching utility"""
    
    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0):
        self.client = redis.Redis(host=host, port=port, db=db)
        
    def get(self, key: str) -> Optional[Any]:
        """Get cached value"""
        value = self.client.get(key)
        if value:
            return json.loads(value)
        return None
        
    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        """Set cached value with TTL"""
        self.client.setex(key, ttl, json.dumps(value))
        
    def delete(self, key: str) -> None:
        """Delete cached value"""
        self.client.delete(key)
        
    def cached(self, key_prefix: str, ttl: int = 300):
        """Decorator for caching function results"""
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                cache_key = f"{key_prefix}:{':'.join(map(str, args))}"
                cached_value = self.get(cache_key)
                if cached_value is not None:
                    return cached_value
                    
                result = func(*args, **kwargs)
                self.set(cache_key, result, ttl)
                return result
            return wrapper
        return decorator
```

### 5.2 Async Database Operations

**Async Database Handler:**
```python
# shared-libs/database/async_db.py
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker
from typing import AsyncGenerator

class AsyncDatabase:
    """Async database handler"""
    
    def __init__(self, database_url: str):
        self.engine = create_async_engine(
            database_url,
            echo=True,
            pool_size=20,
            max_overflow=30
        )
        self.async_session = sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False
        )
        
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get async database session"""
        async with self.async_session() as session:
            yield session
```

---

## 6. Testing Strategy

### 6.1 Test Structure

```
tests/
├── unit/
│   ├── test_agents.py
│   ├── test_detection.py
│   ├── test_environment.py
│   └── test_models.py
├── integration/
│   ├── test_api.py
│   ├── test_simulation.py
│   └── test_training.py
├── property/
│   ├── test_property_rl.py
│   └── test_property_detection.py
└── performance/
    ├── test_load.py
    └── test_stress.py
```

### 6.2 Property-Based Testing

**Hypothesis Tests:**
```python
# tests/property/test_property_rl.py
from hypothesis import given, strategies as st
from simulation_service.src.environment.configurable_env import ConfigurableCyberEnv, NetworkConfig

@given(
    num_hosts=st.integers(min_value=5, max_value=100),
    max_steps=st.integers(min_value=10, max_value=1000)
)
def test_simulation_state_invariants(num_hosts: int, max_steps: int):
    """Property: Simulation should always maintain valid state"""
    config = NetworkConfig(
        num_hosts=num_hosts,
        topology_type="star",
        zones={},
        connectivity_rules=[],
        data_distribution={}
    )
    env = ConfigurableCyberEnv(config)
    obs, info = env.reset()
    
    # Invariants
    assert obs["network_topology"].shape == (num_hosts, num_hosts)
    assert obs["host_status"].shape == (num_hosts,)
    assert 0 <= info["red_position"] < num_hosts
    assert all(0 <= status <= 1 for status in obs["host_status"])
```

---

## 7. Monitoring & Observability

### 7.1 Metrics Collection

**Prometheus Metrics:**
```python
# shared-libs/monitoring/metrics.py
from prometheus_client import Counter, Histogram, Gauge

# Simulation metrics
SIMULATION_STEPS = Counter(
    'cyberguardian_simulation_steps_total',
    'Total simulation steps executed'
)

SIMULATION_DURATION = Histogram(
    'cyberguardian_simulation_duration_seconds',
    'Duration of simulation execution',
    buckets=[0.1, 0.5, 1.0, 2.0, 5.0, 10.0]
)

# Detection metrics
DETECTION_LATENCY = Histogram(
    'cyberguardian_detection_latency_seconds',
    'Time to detect threats',
    buckets=[0.01, 0.05, 0.1, 0.5, 1.0]
)

DETECTION_ACCURACY = Gauge(
    'cyberguardian_detection_accuracy',
    'Detection accuracy rate'
)

# Agent metrics
AGENT_ACTIONS = Counter(
    'cyberguardian_agent_actions_total',
    'Total agent actions',
    ['agent_type', 'action_type']
)

AGENT_REWARD = Histogram(
    'cyberguardian_agent_reward',
    'Agent reward distribution',
    ['agent_type'],
    buckets=[-10, -5, -1, 0, 1, 5, 10]
)
```

### 7.2 Structured Logging

**Logging Configuration:**
```python
# shared-libs/monitoring/logging_config.py
import structlog

def configure_logging():
    """Configure structured logging"""
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
```

---

## 8. Error Handling Strategy

### 8.1 Exception Hierarchy

```python
# shared-libs/exceptions/base.py
from typing import Optional

class CyberGuardianException(Exception):
    """Base exception for CyberGuardian services"""
    
    def __init__(
        self, 
        message: str, 
        code: str, 
        status_code: int = 500,
        details: Optional[dict] = None
    ):
        self.message = message
        self.code = code
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

class ResourceNotFound(CyberGuardianException):
    """Resource not found exception"""
    
    def __init__(self, resource_type: str, resource_id: str):
        super().__init__(
            message=f"{resource_type} with id {resource_id} not found",
            code="RESOURCE_NOT_FOUND",
            status_code=404,
            details={"resource_type": resource_type, "resource_id": resource_id}
        )

class ValidationError(CyberGuardianException):
    """Validation error exception"""
    
    def __init__(self, field: str, reason: str):
        super().__init__(
            message=f"Validation failed for field '{field}': {reason}",
            code="VALIDATION_ERROR",
            status_code=400,
            details={"field": field, "reason": reason}
        )

class RateLimitExceeded(CyberGuardianException):
    """Rate limit exceeded exception"""
    
    def __init__(self, limit: str, retry_after: int):
        super().__init__(
            message=f"Rate limit exceeded: {limit}",
            code="RATE_LIMIT_EXCEEDED",
            status_code=429,
            details={"limit": limit, "retry_after": retry_after}
        )
```

### 8.2 Error Response Format

```python
# shared-libs/responses/error_response.py
from pydantic import BaseModel
from typing import Optional, Dict

class ErrorResponse(BaseModel):
    """Standardized error response format"""
    
    success: bool = False
    error: str
    code: str
    details: Optional[Dict] = None
    request_id: Optional[str] = None
    
    class Config:
        schema_extra = {
            "example": {
                "success": False,
                "error": "Simulation not found",
                "code": "RESOURCE_NOT_FOUND",
                "details": {
                    "resource_type": "simulation",
                    "resource_id": "abc-123"
                },
                "request_id": "req-xyz-789"
            }
        }
```

---

## 9. Dependencies

### 9.1 Backend Dependencies

**Python Requirements:**
```txt
# Core framework
fastapi==0.104.1
uvicorn[standard]==0.24.0
pydantic==2.5.0
pydantic-settings==2.1.0

# Database
sqlalchemy==2.0.23
asyncpg==0.29.0
alembic==1.12.1
redis==5.0.1

# ML & RL
stable-baselines3==2.2.1
gymnasium==0.29.1
torch==2.1.1
xgboost==2.0.2
scikit-learn==1.3.2

# LLM
transformers==4.35.2
langchain==0.1.0
openai==1.3.0

# Monitoring
prometheus-client==0.19.0
structlog==23.2.0
opentelemetry-api==1.21.0
opentelemetry-sdk==1.21.0

# Security
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6

# Rate limiting
slowapi==0.1.9

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
hypothesis==6.92.0
pytest-cov==4.1.0

# Utilities
python-dotenv==1.0.0
httpx==0.25.2
```

### 9.2 Frontend Dependencies

**Package.json:**
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.7",
    "three": "^0.159.0",
    "@react-three/fiber": "^8.15.11",
    "@react-three/drei": "^9.88.11",
    "recharts": "^2.10.3",
    "react-window": "^1.8.10",
    "swr": "^2.2.4"
  },
  "devDependencies": {
    "@types/react": "^18.2.42",
    "@types/react-dom": "^18.2.17",
    "@types/three": "^0.159.0",
    "@types/react-window": "^1.8.8",
    "typescript": "^5.3.2",
    "vite": "^5.0.4",
    "@vitejs/plugin-react": "^4.2.0"
  }
}
```

---

## 10. Implementation Phases

### Phase 1: Foundation (Weeks 1-2)
- Set up new service directory structure
- Implement API Gateway with rate limiting
- Create shared-libs for common utilities
- Set up PostgreSQL database with initial schema
- Implement basic authentication and authorization
- Create comprehensive test suite structure

### Phase 2: Core Services (Weeks 3-4)
- Implement Simulation Service with configurable environment
- Implement Detection Service with ML-based detection
- Set up Redis caching layer
- Implement async database operations
- Create monitoring and logging infrastructure

### Phase 3: Advanced Features (Weeks 5-6)
- Implement Analytics Service with kill chain analysis
- Implement Training Service with advanced RL algorithms
- Create model registry and versioning system
- Implement hyperparameter optimization
- Set up distributed training infrastructure

### Phase 4: Frontend Enhancement (Weeks 7-8)
- Implement Zustand state management
- Create reusable component library
- Implement real-time dashboard with WebSocket
- Add interactive visualizations with Three.js
- Implement responsive design and accessibility

### Phase 5: Containerization & Deployment (Weeks 9-10)
- Create Dockerfiles for all services
- Set up Docker Compose for local development
- Create Kubernetes manifests for production
- Implement CI/CD pipeline
- Set up monitoring dashboards and alerting

---

## 11. Success Criteria

### Performance Metrics
- API response time < 100ms for 95th percentile
- Simulation step execution < 10ms
- Detection latency < 50ms
- Support 1000 concurrent simulations
- 99.9% uptime for production services

### Quality Metrics
- Test coverage > 80%
- Zero critical security vulnerabilities
- All API endpoints documented with OpenAPI
- All services have health check endpoints
- Structured logging for all services

### User Experience Metrics
- Page load time < 2 seconds
- Real-time updates with < 1 second latency
- Mobile-responsive design
- WCAG 2.1 AA accessibility compliance
- Dark/light mode support

---

## 12. Risk Mitigation

### Technical Risks
- **Database Migration**: Use Alembic for versioned migrations, maintain backward compatibility
- **Service Communication**: Implement circuit breakers and retry logic
- **Performance**: Load testing before deployment, horizontal scaling capability
- **Security**: Regular security audits, penetration testing, dependency scanning

### Operational Risks
- **Deployment**: Blue-green deployment strategy, rollback procedures
- **Monitoring**: Comprehensive alerting, on-call rotation
- **Documentation**: Keep documentation in sync with code changes
- **Training**: Team training on new technologies and processes

---

This design document provides a comprehensive blueprint for implementing the improvements outlined in the IMPROVEMENTS_ANALYSIS.md. All implementations will be done as new code alongside the existing codebase, ensuring backward compatibility and gradual migration.
