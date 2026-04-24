import torch
import numpy as np
from stable_baselines3 import PPO
from stable_baselines3.common.buffers import DictRolloutBuffer

class TeacherGuidedPPO(PPO):
    """
    Subclasses the SB3 PPO to inject the Teacher Auxiliary Loss mathematically.
    This resolves the cold-start problem by using the generative LLM priors.
    """
    def __init__(self, policy, env, teacher_agent, teacher_sigma_init=0.1, teacher_batch_size=4, **kwargs):
        super().__init__(policy, env, **kwargs)
        self.teacher_agent = teacher_agent
        self.teacher_sigma = teacher_sigma_init
        self.teacher_batch_size = teacher_batch_size

    def train(self) -> None:
        """
        Update policy using standard PPO loss, followed by Teacher Auxiliary Loss.
        This honors the sequence: grad(L_A) + grad(L_Teacher) = grad(L_A + L_Teacher)
        """
        # 1. Standard PPO Phase (L_A)
        super().train()
        
        # 2. Auxiliary Teacher Phase
        if self.teacher_agent is None or self.rollout_buffer.full == False:
            return
            
        print(f"Applying Teacher-Guided Auxiliary Loss (sigma={self.teacher_sigma:.2f})...")
        
        # Sample a minimal batch to keep LLM overhead low (~4 API calls)
        rollout_data = self.rollout_buffer.sample(self.teacher_batch_size)
        observations = rollout_data.observations
        
        teacher_actions = []
        for i in range(self.teacher_batch_size):
            # Extract single dict obs
            single_obs = {k: v[i].cpu().numpy() for k, v in observations.items()}
            
            # Query LLM Teacher (Blue Agent)
            # Will fallback to random heuristics if API fails or parsing fails
            t_action, _ = self.teacher_agent.predict(single_obs)
            teacher_actions.append(t_action)
            
        teacher_actions_tensor = torch.tensor(np.array(teacher_actions), dtype=torch.long, device=self.device)
        
        # Forward pass the actor network to get probability distributions
        distribution = self.policy.get_distribution(observations)
        
        # Extract Log Probabilities of the teacher taking these actions
        # MultiDiscrete returns sum of log probs across action dims
        log_prob = distribution.log_prob(teacher_actions_tensor)
        
        # L_Teacher = -log pi(a_Teacher | s)
        loss_teacher = -log_prob.mean()
        
        # Apply Sigma Weight (decaying influence over time)
        loss = (1 - self.teacher_sigma) * loss_teacher
        
        # Backward optimization
        self.policy.optimizer.zero_grad()
        loss.backward()
        torch.nn.utils.clip_grad_norm_(self.policy.parameters(), self.max_grad_norm)
        self.policy.optimizer.step()
        
        # Gradually increase sigma so the agent transitions to autonomy
        self.teacher_sigma = min(1.0, self.teacher_sigma + 0.05)
