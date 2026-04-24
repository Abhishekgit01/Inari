from sqlalchemy import Column, Integer, String, Float, Boolean, JSON, DateTime, ForeignKey
from sqlalchemy.orm import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class Episode(Base):
    __tablename__ = "episodes"
    
    id = Column(String, primary_key=True)
    start_time = Column(DateTime, default=datetime.utcnow)
    end_time = Column(DateTime, nullable=True)
    total_steps = Column(Integer)
    winner = Column(String)
    
    final_red_reward = Column(Float)
    final_blue_reward = Column(Float)
    detection_rate = Column(Float)
    false_positive_rate = Column(Float)
    data_loss = Column(Float)
    
    logs = relationship("Log", back_populates="episode")
    alerts = relationship("Alert", back_populates="episode")

class Log(Base):
    __tablename__ = "logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    episode_id = Column(String, ForeignKey("episodes.id"))
    timestamp = Column(Integer)
    event_type = Column(String)
    source_host = Column(Integer, nullable=True)
    target_host = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=True)
    metadata_json = Column(JSON, nullable=True)
    
    episode = relationship("Episode", back_populates="logs")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(String, primary_key=True)
    episode_id = Column(String, ForeignKey("episodes.id"))
    timestamp = Column(Integer)
    threat_type = Column(String)
    severity = Column(String)
    confidence = Column(Float)
    affected_hosts = Column(JSON)
    description = Column(String)
    mitre_id = Column(String, nullable=True)
    status = Column(String, default="active")
    
    episode = relationship("Episode", back_populates="alerts")

class Model(Base):
    __tablename__ = "models"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    agent_type = Column(String)
    version = Column(String)
    training_steps = Column(Integer)
    win_rate = Column(Float)
    avg_reward = Column(Float)
    created_at = Column(DateTime, default=datetime.utcnow)
    file_path = Column(String)
    is_active = Column(Boolean, default=False)
