"""Strategy evolver — manages evolution of strategies across episodes."""

from __future__ import annotations

import copy
import logging
import random
from typing import Any

from pydantic import BaseModel, Field

from .config import HyperAgentConfig
from .meta_engine import MetaEngine

logger = logging.getLogger(__name__)


class StrategyRecord(BaseModel):
    """A strategy parameter set with its episode score."""
    params: dict[str, Any]
    score: float = 0.0
    episode: int = 0
    agent_type: str = ""
    wins: int = 0
    losses: int = 0


class EvolutionReport(BaseModel):
    total_strategies: int = 0
    best_score: float = 0.0
    worst_score: float = 0.0
    avg_score: float = 0.0
    generations: int = 0
    top_strategies: list[dict[str, Any]] = Field(default_factory=list)
    recent_mutations: list[str] = Field(default_factory=list)


class StrategyEvolver:
    """Maintains a population of strategy parameter sets and evolves them.

    After each episode:
    - Records the strategy params used and the final score
    - Ranks all strategies by score
    - Uses the meta-engine to cross-pollinate top strategies
    - Generates mutated variants of successful strategies
    - Prunes worst-performing strategies
    """

    def __init__(self, agent_type: str, config: HyperAgentConfig | None = None) -> None:
        self.agent_type = agent_type
        self.config = config or HyperAgentConfig()
        self.population: list[StrategyRecord] = []
        self._generation: int = 0
        self._episode_counter: int = 0

    def record_episode(self, params: dict[str, Any], score: float, episode_data: dict[str, Any] | None = None) -> None:
        """Record outcome of an episode with its strategy params."""
        self._episode_counter += 1
        win = episode_data.get("won", False) if episode_data else False
        record = StrategyRecord(
            params=copy.deepcopy(params),
            score=score,
            episode=self._episode_counter,
            agent_type=self.agent_type,
            wins=1 if win else 0,
            losses=0 if win else 1,
        )
        self.population.append(record)

        # Prune if over capacity
        max_pop = self.config.strategy_population_size * 2
        if len(self.population) > max_pop:
            self.population.sort(key=lambda r: r.score, reverse=True)
            self.population = self.population[:max_pop]

    def get_next_strategy(self) -> dict[str, Any]:
        """Select strategy params for the next episode.

        Uses tournament selection: pick 3 random strategies, return the best.
        Falls back to default params if population is empty.
        """
        if not self.population:
            return {}

        if len(self.population) < 3:
            best = max(self.population, key=lambda r: r.score)
            return copy.deepcopy(best.params)

        candidates = random.sample(self.population, min(3, len(self.population)))
        best = max(candidates, key=lambda r: r.score)
        return copy.deepcopy(best.params)

    def evolve(self, meta_engine: MetaEngine | None = None) -> list[dict[str, Any]]:
        """Generate new strategies via crossover and mutation.

        Returns list of new strategy param dicts.
        """
        self._generation += 1
        new_strategies: list[dict[str, Any]] = []

        if len(self.population) < 2:
            # Mutate a single strategy
            if self.population:
                base = self.population[0]
                mutated = self._mutate(base.params)
                new_strategies.append(mutated)
            return new_strategies

        # Sort by score
        self.population.sort(key=lambda r: r.score, reverse=True)
        top_n = max(2, len(self.population) // 2)

        # Crossover top strategies
        for _ in range(self.config.strategy_population_size // 2):
            parent_a = random.choice(self.population[:top_n])
            parent_b = random.choice(self.population[:top_n])
            child = self._crossover(parent_a.params, parent_b.params)
            child = self._mutate(child)
            new_strategies.append(child)

        # Add a few pure mutations of the best
        best = self.population[0]
        for _ in range(2):
            mutated = self._mutate(best.params, mutation_rate=0.15)
            new_strategies.append(mutated)

        # Add new strategies to population
        for params in new_strategies:
            self.population.append(StrategyRecord(
                params=params,
                score=0.0,
                episode=0,
                agent_type=self.agent_type,
            ))

        return new_strategies

    def _crossover(self, parent_a: dict[str, Any], parent_b: dict[str, Any]) -> dict[str, Any]:
        """Uniform crossover of two strategy param dicts."""
        child: dict[str, Any] = {}
        all_keys = set(list(parent_a.keys()) + list(parent_b.keys()))
        for key in all_keys:
            if key in parent_a and key in parent_b:
                # Pick from either parent with 50% chance
                if random.random() < 0.5:
                    child[key] = copy.deepcopy(parent_a[key])
                else:
                    child[key] = copy.deepcopy(parent_b[key])
            elif key in parent_a:
                child[key] = copy.deepcopy(parent_a[key])
            else:
                child[key] = copy.deepcopy(parent_b[key])
        return child

    def _mutate(self, params: dict[str, Any], mutation_rate: float = 0.1) -> dict[str, Any]:
        """Mutate numeric parameters by adding Gaussian noise."""
        mutated = copy.deepcopy(params)
        for key, value in mutated.items():
            if isinstance(value, float) and random.random() < mutation_rate:
                noise = random.gauss(0, 0.05)
                mutated[key] = max(0.0, min(1.0, value + noise))
            elif isinstance(value, list) and random.random() < mutation_rate:
                # Shuffle list params slightly
                if all(isinstance(v, int) for v in value):
                    idx_a = random.randint(0, len(value) - 1)
                    idx_b = random.randint(0, len(value) - 1)
                    value[idx_a], value[idx_b] = value[idx_b], value[idx_a]
        return mutated

    def get_evolution_report(self) -> EvolutionReport:
        """Return a summary for API/dashboard."""
        if not self.population:
            return EvolutionReport(generations=self._generation)

        scores = [r.score for r in self.population]
        top = sorted(self.population, key=lambda r: r.score, reverse=True)[:5]

        return EvolutionReport(
            total_strategies=len(self.population),
            best_score=max(scores),
            worst_score=min(scores),
            avg_score=sum(scores) / len(scores),
            generations=self._generation,
            top_strategies=[
                {"episode": r.episode, "score": r.score, "params": r.params}
                for r in top
            ],
            recent_mutations=[
                f"Gen {self._generation}: {len(self.population)} strategies"
            ],
        )
