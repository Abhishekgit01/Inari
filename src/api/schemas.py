"""
Pydantic schemas for API request/response validation
This is NEW code for input validation
"""
from pydantic import BaseModel, Field, validator
from typing import Literal, Optional, Dict, List
from datetime import datetime


# Simulation schemas
class SimulationCreateRequest(BaseModel):
    """Request schema for creating a new simulation"""
    num_hosts: int = Field(20, ge=5, le=100, description="Number of hosts in network")
    max_steps: int = Field(100, ge=10, le=1000, description="Maximum simulation steps")
    scenario: Literal["easy", "medium", "hard", "expert"] = "medium"
    
    @validator('num_hosts')
    def validate_hosts(cls, v):
        if v % 5 != 0:
            raise ValueError("num_hosts must be multiple of 5")
        return v


class SimulationStepRequest(BaseModel):
    """Request schema for stepping a simulation"""
    simulation_id: str
    red_action: Optional[List[int]] = None
    blue_action: Optional[List[int]] = None


class SimulationResponse(BaseModel):
    """Response schema for simulation operations"""
    simulation_id: str
    status: str
    network_state: Dict
    metrics: Dict
    timestamp: datetime = Field(default_factory=datetime.now)


# Detection schemas
class DetectionRequest(BaseModel):
    """Request schema for detection analysis"""
    simulation_id: str
    time_range: Optional[int] = Field(3600, ge=60, le=86400, description="Time range in seconds")
    severity_filter: Optional[List[str]] = ["low", "medium", "high", "critical"]


class DetectionResponse(BaseModel):
    """Response schema for detection results"""
    simulation_id: str
    threats: List[Dict]
    confidence_scores: Dict[str, float]
    timestamp: datetime = Field(default_factory=datetime.now)


# Training schemas
class TrainingStartRequest(BaseModel):
    """Request schema for starting training"""
    algorithm: Literal["ppo", "dqn", "a2c"] = "ppo"
    num_episodes: int = Field(100, ge=10, le=10000)
    learning_rate: float = Field(0.001, ge=0.0001, le=0.1)
    batch_size: int = Field(32, ge=8, le=256)


class TrainingResponse(BaseModel):
    """Response schema for training operations"""
    training_id: str
    status: str
    progress: float
    metrics: Dict
    timestamp: datetime = Field(default_factory=datetime.now)


# Analytics schemas
class AnalyticsRequest(BaseModel):
    """Request schema for analytics"""
    simulation_id: str
    analysis_type: Literal["kill_chain", "apt_attribution", "timeline"]


class AnalyticsResponse(BaseModel):
    """Response schema for analytics results"""
    simulation_id: str
    analysis_type: str
    results: Dict
    timestamp: datetime = Field(default_factory=datetime.now)
