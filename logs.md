Initializing Environment with 20 nodes...
Using cuda device
Wrapping the env with a `Monitor` wrapper
Wrapping the env in a DummyVecEnv.
Starting production training run (100k steps)...
Logging to ./ppo_metrics/PPO_6
---------------------------------
| rollout/           |          |
|    ep_len_mean     | 84       |
|    ep_rew_mean     | 321      |
| time/              |          |
|    fps             | 240      |
|    iterations      | 1        |
|    time_elapsed    | 8        |
|    total_timesteps | 2048     |
---------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.10)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 86.6         |
|    ep_rew_mean          | 517          |
| time/                   |              |
|    fps                  | 182          |
|    iterations           | 2            |
|    time_elapsed         | 22           |
|    total_timesteps      | 4096         |
| train/                  |              |
|    approx_kl            | 0.0039110365 |
|    clip_fraction        | 0.014        |
|    clip_range           | 0.2          |
|    entropy_loss         | -9.57        |
|    explained_variance   | -4.72e-05    |
|    learning_rate        | 0.0003       |
|    loss                 | 3.64e+04     |
|    n_updates            | 10           |
|    policy_gradient_loss | -0.0198      |
|    value_loss           | 3.86e+05     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.15)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 86.2        |
|    ep_rew_mean          | 230         |
| time/                   |             |
|    fps                  | 170         |
|    iterations           | 3           |
|    time_elapsed         | 36          |
|    total_timesteps      | 6144        |
| train/                  |             |
|    approx_kl            | 0.004286551 |
|    clip_fraction        | 0.0426      |
|    clip_range           | 0.2         |
|    entropy_loss         | -9.57       |
|    explained_variance   | 0.00167     |
|    learning_rate        | 0.0003      |
|    loss                 | 1.49e+05    |
|    n_updates            | 20          |
|    policy_gradient_loss | -0.00116    |
|    value_loss           | 4.12e+05    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.20)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 86.2       |
|    ep_rew_mean          | 271        |
| time/                   |            |
|    fps                  | 164        |
|    iterations           | 4          |
|    time_elapsed         | 49         |
|    total_timesteps      | 8192       |
| train/                  |            |
|    approx_kl            | 0.00520112 |
|    clip_fraction        | 0.0441     |
|    clip_range           | 0.2        |
|    entropy_loss         | -9.56      |
|    explained_variance   | 0.00438    |
|    learning_rate        | 0.0003     |
|    loss                 | 3.95e+04   |
|    n_updates            | 30         |
|    policy_gradient_loss | -0.00196   |
|    value_loss           | 9.96e+04   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.25)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 85          |
|    ep_rew_mean          | 234         |
| time/                   |             |
|    fps                  | 159         |
|    iterations           | 5           |
|    time_elapsed         | 64          |
|    total_timesteps      | 10240       |
| train/                  |             |
|    approx_kl            | 0.009650912 |
|    clip_fraction        | 0.111       |
|    clip_range           | 0.2         |
|    entropy_loss         | -9.51       |
|    explained_variance   | 0.0021      |
|    learning_rate        | 0.0003      |
|    loss                 | 9.89e+03    |
|    n_updates            | 40          |
|    policy_gradient_loss | 0.00362     |
|    value_loss           | 2.55e+05    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.30)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 83.2        |
|    ep_rew_mean          | 108         |
| time/                   |             |
|    fps                  | 156         |
|    iterations           | 6           |
|    time_elapsed         | 78          |
|    total_timesteps      | 12288       |
| train/                  |             |
|    approx_kl            | 0.015881836 |
|    clip_fraction        | 0.329       |
|    clip_range           | 0.2         |
|    entropy_loss         | -9.42       |
|    explained_variance   | 0.00232     |
|    learning_rate        | 0.0003      |
|    loss                 | 1.56e+04    |
|    n_updates            | 50          |
|    policy_gradient_loss | 0.0223      |
|    value_loss           | 1.17e+05    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.35)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 81.9       |
|    ep_rew_mean          | 111        |
| time/                   |            |
|    fps                  | 155        |
|    iterations           | 7          |
|    time_elapsed         | 92         |
|    total_timesteps      | 14336      |
| train/                  |            |
|    approx_kl            | 0.02455328 |
|    clip_fraction        | 0.412      |
|    clip_range           | 0.2        |
|    entropy_loss         | -9.27      |
|    explained_variance   | 0.00986    |
|    learning_rate        | 0.0003     |
|    loss                 | 1.22e+04   |
|    n_updates            | 60         |
|    policy_gradient_loss | 0.0172     |
|    value_loss           | 2.58e+05   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.40)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 80.5        |
|    ep_rew_mean          | 7.65        |
| time/                   |             |
|    fps                  | 153         |
|    iterations           | 8           |
|    time_elapsed         | 106         |
|    total_timesteps      | 16384       |
| train/                  |             |
|    approx_kl            | 0.022308417 |
|    clip_fraction        | 0.34        |
|    clip_range           | 0.2         |
|    entropy_loss         | -9.08       |
|    explained_variance   | 0.00437     |
|    learning_rate        | 0.0003      |
|    loss                 | 1.04e+05    |
|    n_updates            | 70          |
|    policy_gradient_loss | 0.0107      |
|    value_loss           | 1.55e+05    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.45)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 79.3       |
|    ep_rew_mean          | 75.6       |
| time/                   |            |
|    fps                  | 152        |
|    iterations           | 9          |
|    time_elapsed         | 120        |
|    total_timesteps      | 18432      |
| train/                  |            |
|    approx_kl            | 0.03587282 |
|    clip_fraction        | 0.468      |
|    clip_range           | 0.2        |
|    entropy_loss         | -8.76      |
|    explained_variance   | 0.0143     |
|    learning_rate        | 0.0003     |
|    loss                 | 2.96e+04   |
|    n_updates            | 80         |
|    policy_gradient_loss | 0.0294     |
|    value_loss           | 9.18e+04   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.50)...
---------------------------------------
| rollout/                |           |
|    ep_len_mean          | 77.9      |
|    ep_rew_mean          | -75.6     |
| time/                   |           |
|    fps                  | 152       |
|    iterations           | 10        |
|    time_elapsed         | 134       |
|    total_timesteps      | 20480     |
| train/                  |           |
|    approx_kl            | 0.0210162 |
|    clip_fraction        | 0.328     |
|    clip_range           | 0.2       |
|    entropy_loss         | -8.4      |
|    explained_variance   | 0.00267   |
|    learning_rate        | 0.0003    |
|    loss                 | 5.97e+04  |
|    n_updates            | 90        |
|    policy_gradient_loss | 0.0109    |
|    value_loss           | 2.74e+05  |
---------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.55)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 76         |
|    ep_rew_mean          | -67.7      |
| time/                   |            |
|    fps                  | 152        |
|    iterations           | 11         |
|    time_elapsed         | 147        |
|    total_timesteps      | 22528      |
| train/                  |            |
|    approx_kl            | 0.06900917 |
|    clip_fraction        | 0.623      |
|    clip_range           | 0.2        |
|    entropy_loss         | -7.54      |
|    explained_variance   | 0.0474     |
|    learning_rate        | 0.0003     |
|    loss                 | 9.12e+03   |
|    n_updates            | 100        |
|    policy_gradient_loss | 0.077      |
|    value_loss           | 1.87e+04   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.60)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 72.6        |
|    ep_rew_mean          | -196        |
| time/                   |             |
|    fps                  | 151         |
|    iterations           | 12          |
|    time_elapsed         | 162         |
|    total_timesteps      | 24576       |
| train/                  |             |
|    approx_kl            | 0.089894086 |
|    clip_fraction        | 0.72        |
|    clip_range           | 0.2         |
|    entropy_loss         | -6.44       |
|    explained_variance   | 0.0793      |
|    learning_rate        | 0.0003      |
|    loss                 | 1e+04       |
|    n_updates            | 110         |
|    policy_gradient_loss | 0.057       |
|    value_loss           | 1.47e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.65)...
[Warning] Defender agent API failed or parsing error: Client error '402 Payment Required' for url 'https://router.huggingface.co/v1/chat/completions' (Request ID: Root=1-69ddb4f6-1209ef095c76e51a77edc236;d423bcc4-8f74-41b1-b9e4-ec212db388fe)
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

You have depleted your monthly included credits. Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get 20x more included usage.. Using fallback.
---------------------------------------
| rollout/                |           |
|    ep_len_mean          | 63.1      |
|    ep_rew_mean          | -141      |
| time/                   |           |
|    fps                  | 151       |
|    iterations           | 13        |
|    time_elapsed         | 175       |
|    total_timesteps      | 26624     |
| train/                  |           |
|    approx_kl            | 0.2308332 |
|    clip_fraction        | 0.656     |
|    clip_range           | 0.2       |
|    entropy_loss         | -4.5      |
|    explained_variance   | 0.0785    |
|    learning_rate        | 0.0003    |
|    loss                 | 5.24e+03  |
|    n_updates            | 120       |
|    policy_gradient_loss | 0.122     |
|    value_loss           | 1.16e+04  |
---------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.70)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 57.4        |
|    ep_rew_mean          | -156        |
| time/                   |             |
|    fps                  | 150         |
|    iterations           | 14          |
|    time_elapsed         | 190         |
|    total_timesteps      | 28672       |
| train/                  |             |
|    approx_kl            | 0.017559685 |
|    clip_fraction        | 0.196       |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.41       |
|    explained_variance   | 0.0728      |
|    learning_rate        | 0.0003      |
|    loss                 | 1.95e+03    |
|    n_updates            | 130         |
|    policy_gradient_loss | 0.00687     |
|    value_loss           | 7.1e+03     |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.75)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 53.5        |
|    ep_rew_mean          | -116        |
| time/                   |             |
|    fps                  | 150         |
|    iterations           | 15          |
|    time_elapsed         | 204         |
|    total_timesteps      | 30720       |
| train/                  |             |
|    approx_kl            | 0.012784747 |
|    clip_fraction        | 0.242       |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.16       |
|    explained_variance   | 0.00318     |
|    learning_rate        | 0.0003      |
|    loss                 | 2.58e+03    |
|    n_updates            | 140         |
|    policy_gradient_loss | -0.000922   |
|    value_loss           | 4.29e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.80)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 53.7       |
|    ep_rew_mean          | -102       |
| time/                   |            |
|    fps                  | 150        |
|    iterations           | 16         |
|    time_elapsed         | 217        |
|    total_timesteps      | 32768      |
| train/                  |            |
|    approx_kl            | 0.03609708 |
|    clip_fraction        | 0.459      |
|    clip_range           | 0.2        |
|    entropy_loss         | -4.41      |
|    explained_variance   | 0.0274     |
|    learning_rate        | 0.0003     |
|    loss                 | 2.27e+03   |
|    n_updates            | 150        |
|    policy_gradient_loss | 0.0223     |
|    value_loss           | 5.74e+03   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.85)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 54.1        |
|    ep_rew_mean          | -52.1       |
| time/                   |             |
|    fps                  | 150         |
|    iterations           | 17          |
|    time_elapsed         | 231         |
|    total_timesteps      | 34816       |
| train/                  |             |
|    approx_kl            | 0.018218387 |
|    clip_fraction        | 0.338       |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.93       |
|    explained_variance   | 0.0428      |
|    learning_rate        | 0.0003      |
|    loss                 | 3.26e+03    |
|    n_updates            | 160         |
|    policy_gradient_loss | 0.0112      |
|    value_loss           | 6.29e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.90)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 55.6        |
|    ep_rew_mean          | -49.1       |
| time/                   |             |
|    fps                  | 150         |
|    iterations           | 18          |
|    time_elapsed         | 244         |
|    total_timesteps      | 36864       |
| train/                  |             |
|    approx_kl            | 0.035500236 |
|    clip_fraction        | 0.378       |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.02       |
|    explained_variance   | 0.0674      |
|    learning_rate        | 0.0003      |
|    loss                 | 2.22e+03    |
|    n_updates            | 170         |
|    policy_gradient_loss | 0.0224      |
|    value_loss           | 7.89e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=0.95)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 55.2        |
|    ep_rew_mean          | -52.5       |
| time/                   |             |
|    fps                  | 150         |
|    iterations           | 19          |
|    time_elapsed         | 259         |
|    total_timesteps      | 38912       |
| train/                  |             |
|    approx_kl            | 0.016951226 |
|    clip_fraction        | 0.269       |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.66       |
|    explained_variance   | 0.111       |
|    learning_rate        | 0.0003      |
|    loss                 | 2.78e+03    |
|    n_updates            | 180         |
|    policy_gradient_loss | 0.0154      |
|    value_loss           | 7.94e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 53.9        |
|    ep_rew_mean          | -70         |
| time/                   |             |
|    fps                  | 149         |
|    iterations           | 20          |
|    time_elapsed         | 273         |
|    total_timesteps      | 40960       |
| train/                  |             |
|    approx_kl            | 0.023497302 |
|    clip_fraction        | 0.422       |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.21       |
|    explained_variance   | 0.207       |
|    learning_rate        | 0.0003      |
|    loss                 | 2.03e+03    |
|    n_updates            | 190         |
|    policy_gradient_loss | 0.0117      |
|    value_loss           | 3.77e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 53.5         |
|    ep_rew_mean          | -65.3        |
| time/                   |              |
|    fps                  | 149          |
|    iterations           | 21           |
|    time_elapsed         | 288          |
|    total_timesteps      | 43008        |
| train/                  |              |
|    approx_kl            | 0.0007997514 |
|    clip_fraction        | 0.00562      |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.27        |
|    explained_variance   | 0.163        |
|    learning_rate        | 0.0003       |
|    loss                 | 3.28e+03     |
|    n_updates            | 200          |
|    policy_gradient_loss | -0.00288     |
|    value_loss           | 4.64e+03     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
/usr/local/lib/python3.12/dist-packages/jupyter_client/session.py:203: DeprecationWarning: datetime.datetime.utcnow() is deprecated and scheduled for removal in a future version. Use timezone-aware objects to represent datetimes in UTC: datetime.datetime.now(datetime.UTC).
  return datetime.utcnow().replace(tzinfo=utc)
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 54.4         |
|    ep_rew_mean          | -42.3        |
| time/                   |              |
|    fps                  | 148          |
|    iterations           | 22           |
|    time_elapsed         | 302          |
|    total_timesteps      | 45056        |
| train/                  |              |
|    approx_kl            | 0.0003043167 |
|    clip_fraction        | 0.000244     |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.29        |
|    explained_variance   | 0.13         |
|    learning_rate        | 0.0003       |
|    loss                 | 5.81e+03     |
|    n_updates            | 210          |
|    policy_gradient_loss | -0.00164     |
|    value_loss           | 6.77e+03     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 53.5       |
|    ep_rew_mean          | -78.1      |
| time/                   |            |
|    fps                  | 148        |
|    iterations           | 23         |
|    time_elapsed         | 316        |
|    total_timesteps      | 47104      |
| train/                  |            |
|    approx_kl            | 0.00196532 |
|    clip_fraction        | 0.00386    |
|    clip_range           | 0.2        |
|    entropy_loss         | -3.33      |
|    explained_variance   | 0.0433     |
|    learning_rate        | 0.0003     |
|    loss                 | 5.18e+03   |
|    n_updates            | 220        |
|    policy_gradient_loss | -0.00361   |
|    value_loss           | 6.63e+03   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 54.9        |
|    ep_rew_mean          | -86.4       |
| time/                   |             |
|    fps                  | 148         |
|    iterations           | 24          |
|    time_elapsed         | 330         |
|    total_timesteps      | 49152       |
| train/                  |             |
|    approx_kl            | 0.002744027 |
|    clip_fraction        | 0.0084      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.4        |
|    explained_variance   | 0.000697    |
|    learning_rate        | 0.0003      |
|    loss                 | 1.08e+03    |
|    n_updates            | 230         |
|    policy_gradient_loss | -0.00443    |
|    value_loss           | 3.33e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-------------------------------------------
| rollout/                |               |
|    ep_len_mean          | 55.9          |
|    ep_rew_mean          | -49.2         |
| time/                   |               |
|    fps                  | 148           |
|    iterations           | 25            |
|    time_elapsed         | 344           |
|    total_timesteps      | 51200         |
| train/                  |               |
|    approx_kl            | 0.00047921727 |
|    clip_fraction        | 0.000781      |
|    clip_range           | 0.2           |
|    entropy_loss         | -3.45         |
|    explained_variance   | 0.113         |
|    learning_rate        | 0.0003        |
|    loss                 | 5.31e+03      |
|    n_updates            | 240           |
|    policy_gradient_loss | -0.00198      |
|    value_loss           | 4.49e+03      |
-------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
[Warning] Defender agent API failed or parsing error: Client error '402 Payment Required' for url 'https://router.huggingface.co/v1/chat/completions' (Request ID: Root=1-69ddb5ac-2d90fb1672de5d666ee34c95;d2769457-5c1f-4364-9f2a-58881c87b5f8)
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

You have depleted your monthly included credits. Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get 20x more included usage.. Using fallback.
-------------------------------------------
| rollout/                |               |
|    ep_len_mean          | 56.9          |
|    ep_rew_mean          | 9.06          |
| time/                   |               |
|    fps                  | 148           |
|    iterations           | 26            |
|    time_elapsed         | 358           |
|    total_timesteps      | 53248         |
| train/                  |               |
|    approx_kl            | 0.00019896188 |
|    clip_fraction        | 0.000146      |
|    clip_range           | 0.2           |
|    entropy_loss         | -3.44         |
|    explained_variance   | 0.145         |
|    learning_rate        | 0.0003        |
|    loss                 | 3.07e+03      |
|    n_updates            | 250           |
|    policy_gradient_loss | -0.00142      |
|    value_loss           | 1.11e+04      |
-------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 55.4         |
|    ep_rew_mean          | 7.38         |
| time/                   |              |
|    fps                  | 148          |
|    iterations           | 27           |
|    time_elapsed         | 372          |
|    total_timesteps      | 55296        |
| train/                  |              |
|    approx_kl            | 0.0024537253 |
|    clip_fraction        | 0.00708      |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.46        |
|    explained_variance   | 0.156        |
|    learning_rate        | 0.0003       |
|    loss                 | 9.47e+03     |
|    n_updates            | 260          |
|    policy_gradient_loss | -0.00572     |
|    value_loss           | 8.49e+03     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 55.9         |
|    ep_rew_mean          | -18.1        |
| time/                   |              |
|    fps                  | 148          |
|    iterations           | 28           |
|    time_elapsed         | 386          |
|    total_timesteps      | 57344        |
| train/                  |              |
|    approx_kl            | 0.0017299808 |
|    clip_fraction        | 0.00127      |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.52        |
|    explained_variance   | 0.0689       |
|    learning_rate        | 0.0003       |
|    loss                 | 4.4e+03      |
|    n_updates            | 270          |
|    policy_gradient_loss | -0.00417     |
|    value_loss           | 8.29e+03     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 56.5         |
|    ep_rew_mean          | -26.5        |
| time/                   |              |
|    fps                  | 148          |
|    iterations           | 29           |
|    time_elapsed         | 399          |
|    total_timesteps      | 59392        |
| train/                  |              |
|    approx_kl            | 0.0016786754 |
|    clip_fraction        | 0.00313      |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.61        |
|    explained_variance   | 0.0965       |
|    learning_rate        | 0.0003       |
|    loss                 | 2.26e+03     |
|    n_updates            | 280          |
|    policy_gradient_loss | -0.00468     |
|    value_loss           | 6.51e+03     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 56.5         |
|    ep_rew_mean          | -7.51        |
| time/                   |              |
|    fps                  | 148          |
|    iterations           | 30           |
|    time_elapsed         | 413          |
|    total_timesteps      | 61440        |
| train/                  |              |
|    approx_kl            | 0.0021153502 |
|    clip_fraction        | 0.00747      |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.64        |
|    explained_variance   | 0.125        |
|    learning_rate        | 0.0003       |
|    loss                 | 4.31e+03     |
|    n_updates            | 290          |
|    policy_gradient_loss | -0.00359     |
|    value_loss           | 5.49e+03     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 57           |
|    ep_rew_mean          | -2.54        |
| time/                   |              |
|    fps                  | 148          |
|    iterations           | 31           |
|    time_elapsed         | 428          |
|    total_timesteps      | 63488        |
| train/                  |              |
|    approx_kl            | 0.0006997381 |
|    clip_fraction        | 9.77e-05     |
|    clip_range           | 0.2          |
|    entropy_loss         | -3.65        |
|    explained_variance   | 0.108        |
|    learning_rate        | 0.0003       |
|    loss                 | 6.79e+03     |
|    n_updates            | 300          |
|    policy_gradient_loss | -0.00252     |
|    value_loss           | 1.21e+04     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 56.9        |
|    ep_rew_mean          | 17.1        |
| time/                   |             |
|    fps                  | 148         |
|    iterations           | 32          |
|    time_elapsed         | 442         |
|    total_timesteps      | 65536       |
| train/                  |             |
|    approx_kl            | 0.010680686 |
|    clip_fraction        | 0.104       |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.66       |
|    explained_variance   | 0.0561      |
|    learning_rate        | 0.0003      |
|    loss                 | 1.06e+03    |
|    n_updates            | 310         |
|    policy_gradient_loss | -0.0102     |
|    value_loss           | 3.13e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 55.4        |
|    ep_rew_mean          | 4.94        |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 33          |
|    time_elapsed         | 456         |
|    total_timesteps      | 67584       |
| train/                  |             |
|    approx_kl            | 0.005609599 |
|    clip_fraction        | 0.0519      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.79       |
|    explained_variance   | 0.089       |
|    learning_rate        | 0.0003      |
|    loss                 | 2.44e+03    |
|    n_updates            | 320         |
|    policy_gradient_loss | -0.0094     |
|    value_loss           | 6.04e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 56.4        |
|    ep_rew_mean          | 81          |
| time/                   |             |
|    fps                  | 148         |
|    iterations           | 34          |
|    time_elapsed         | 470         |
|    total_timesteps      | 69632       |
| train/                  |             |
|    approx_kl            | 0.009775166 |
|    clip_fraction        | 0.0733      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.8        |
|    explained_variance   | 0.0895      |
|    learning_rate        | 0.0003      |
|    loss                 | 3.89e+03    |
|    n_updates            | 330         |
|    policy_gradient_loss | -0.00811    |
|    value_loss           | 6.98e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 57.9        |
|    ep_rew_mean          | 117         |
| time/                   |             |
|    fps                  | 148         |
|    iterations           | 35          |
|    time_elapsed         | 483         |
|    total_timesteps      | 71680       |
| train/                  |             |
|    approx_kl            | 0.008998528 |
|    clip_fraction        | 0.0332      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.79       |
|    explained_variance   | 0.187       |
|    learning_rate        | 0.0003      |
|    loss                 | 5.21e+03    |
|    n_updates            | 340         |
|    policy_gradient_loss | -0.00545    |
|    value_loss           | 1.3e+04     |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 59.8        |
|    ep_rew_mean          | 147         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 36          |
|    time_elapsed         | 499         |
|    total_timesteps      | 73728       |
| train/                  |             |
|    approx_kl            | 0.003166607 |
|    clip_fraction        | 0.0043      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.84       |
|    explained_variance   | 0.164       |
|    learning_rate        | 0.0003      |
|    loss                 | 5.39e+03    |
|    n_updates            | 350         |
|    policy_gradient_loss | -0.0042     |
|    value_loss           | 1.05e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 59.3        |
|    ep_rew_mean          | 139         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 37          |
|    time_elapsed         | 513         |
|    total_timesteps      | 75776       |
| train/                  |             |
|    approx_kl            | 0.007743614 |
|    clip_fraction        | 0.0754      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.85       |
|    explained_variance   | 0.068       |
|    learning_rate        | 0.0003      |
|    loss                 | 4.33e+03    |
|    n_updates            | 360         |
|    policy_gradient_loss | -0.011      |
|    value_loss           | 9.71e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 58.4        |
|    ep_rew_mean          | 175         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 38          |
|    time_elapsed         | 527         |
|    total_timesteps      | 77824       |
| train/                  |             |
|    approx_kl            | 0.007555084 |
|    clip_fraction        | 0.0477      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.9        |
|    explained_variance   | 0.0474      |
|    learning_rate        | 0.0003      |
|    loss                 | 3.35e+03    |
|    n_updates            | 370         |
|    policy_gradient_loss | -0.00758    |
|    value_loss           | 9.81e+03    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 60.8        |
|    ep_rew_mean          | 191         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 39          |
|    time_elapsed         | 541         |
|    total_timesteps      | 79872       |
| train/                  |             |
|    approx_kl            | 0.006102722 |
|    clip_fraction        | 0.0189      |
|    clip_range           | 0.2         |
|    entropy_loss         | -3.89       |
|    explained_variance   | 0.0981      |
|    learning_rate        | 0.0003      |
|    loss                 | 4.29e+03    |
|    n_updates            | 380         |
|    policy_gradient_loss | -0.00658    |
|    value_loss           | 1.21e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 62.3        |
|    ep_rew_mean          | 261         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 40          |
|    time_elapsed         | 555         |
|    total_timesteps      | 81920       |
| train/                  |             |
|    approx_kl            | 0.004424426 |
|    clip_fraction        | 0.0198      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4          |
|    explained_variance   | 0.14        |
|    learning_rate        | 0.0003      |
|    loss                 | 6.38e+03    |
|    n_updates            | 390         |
|    policy_gradient_loss | -0.00692    |
|    value_loss           | 1.2e+04     |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 65.2        |
|    ep_rew_mean          | 299         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 41          |
|    time_elapsed         | 569         |
|    total_timesteps      | 83968       |
| train/                  |             |
|    approx_kl            | 0.007212904 |
|    clip_fraction        | 0.0425      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.05       |
|    explained_variance   | 0.159       |
|    learning_rate        | 0.0003      |
|    loss                 | 4.29e+03    |
|    n_updates            | 400         |
|    policy_gradient_loss | -0.00918    |
|    value_loss           | 1.7e+04     |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 68.8        |
|    ep_rew_mean          | 396         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 42          |
|    time_elapsed         | 583         |
|    total_timesteps      | 86016       |
| train/                  |             |
|    approx_kl            | 0.005076721 |
|    clip_fraction        | 0.0201      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.11       |
|    explained_variance   | 0.187       |
|    learning_rate        | 0.0003      |
|    loss                 | 7.34e+03    |
|    n_updates            | 410         |
|    policy_gradient_loss | -0.00742    |
|    value_loss           | 1.46e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
[Warning] Defender agent API failed or parsing error: Client error '402 Payment Required' for url 'https://router.huggingface.co/v1/chat/completions' (Request ID: Root=1-69ddb69b-50a7849e4f4c9c3e17f34f94;bfcee39d-5f14-4fbf-b52e-42ad7eb82705)
For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402

You have depleted your monthly included credits. Purchase pre-paid credits to continue using Inference Providers. Alternatively, subscribe to PRO to get 20x more included usage.. Using fallback.
------------------------------------------
| rollout/                |              |
|    ep_len_mean          | 69.8         |
|    ep_rew_mean          | 434          |
| time/                   |              |
|    fps                  | 147          |
|    iterations           | 43           |
|    time_elapsed         | 597          |
|    total_timesteps      | 88064        |
| train/                  |              |
|    approx_kl            | 0.0036630072 |
|    clip_fraction        | 0.00581      |
|    clip_range           | 0.2          |
|    entropy_loss         | -4.11        |
|    explained_variance   | 0.236        |
|    learning_rate        | 0.0003       |
|    loss                 | 1.12e+04     |
|    n_updates            | 420          |
|    policy_gradient_loss | -0.00401     |
|    value_loss           | 1.65e+04     |
------------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 72.3        |
|    ep_rew_mean          | 480         |
| time/                   |             |
|    fps                  | 147         |
|    iterations           | 44          |
|    time_elapsed         | 611         |
|    total_timesteps      | 90112       |
| train/                  |             |
|    approx_kl            | 0.004968064 |
|    clip_fraction        | 0.0166      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.17       |
|    explained_variance   | 0.32        |
|    learning_rate        | 0.0003      |
|    loss                 | 5.39e+03    |
|    n_updates            | 430         |
|    policy_gradient_loss | -0.00665    |
|    value_loss           | 1.41e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
----------------------------------------
| rollout/                |            |
|    ep_len_mean          | 72.5       |
|    ep_rew_mean          | 512        |
| time/                   |            |
|    fps                  | 147        |
|    iterations           | 45         |
|    time_elapsed         | 625        |
|    total_timesteps      | 92160      |
| train/                  |            |
|    approx_kl            | 0.00627753 |
|    clip_fraction        | 0.0136     |
|    clip_range           | 0.2        |
|    entropy_loss         | -4.22      |
|    explained_variance   | 0.351      |
|    learning_rate        | 0.0003     |
|    loss                 | 3.2e+03    |
|    n_updates            | 440        |
|    policy_gradient_loss | -0.00529   |
|    value_loss           | 1.98e+04   |
----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 72.7        |
|    ep_rew_mean          | 612         |
| time/                   |             |
|    fps                  | 146         |
|    iterations           | 46          |
|    time_elapsed         | 643         |
|    total_timesteps      | 94208       |
| train/                  |             |
|    approx_kl            | 0.006641423 |
|    clip_fraction        | 0.0146      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.22       |
|    explained_variance   | 0.399       |
|    learning_rate        | 0.0003      |
|    loss                 | 8.37e+03    |
|    n_updates            | 450         |
|    policy_gradient_loss | -0.00625    |
|    value_loss           | 2.09e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 76.2        |
|    ep_rew_mean          | 632         |
| time/                   |             |
|    fps                  | 146         |
|    iterations           | 47          |
|    time_elapsed         | 658         |
|    total_timesteps      | 96256       |
| train/                  |             |
|    approx_kl            | 0.005497827 |
|    clip_fraction        | 0.00923     |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.17       |
|    explained_variance   | 0.411       |
|    learning_rate        | 0.0003      |
|    loss                 | 1.36e+04    |
|    n_updates            | 460         |
|    policy_gradient_loss | -0.00534    |
|    value_loss           | 2.64e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 76.7        |
|    ep_rew_mean          | 620         |
| time/                   |             |
|    fps                  | 146         |
|    iterations           | 48          |
|    time_elapsed         | 671         |
|    total_timesteps      | 98304       |
| train/                  |             |
|    approx_kl            | 0.006621322 |
|    clip_fraction        | 0.0309      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.21       |
|    explained_variance   | 0.469       |
|    learning_rate        | 0.0003      |
|    loss                 | 1.62e+04    |
|    n_updates            | 470         |
|    policy_gradient_loss | -0.00748    |
|    value_loss           | 1.82e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
-----------------------------------------
| rollout/                |             |
|    ep_len_mean          | 79.9        |
|    ep_rew_mean          | 640         |
| time/                   |             |
|    fps                  | 146         |
|    iterations           | 49          |
|    time_elapsed         | 685         |
|    total_timesteps      | 100352      |
| train/                  |             |
|    approx_kl            | 0.006600817 |
|    clip_fraction        | 0.0281      |
|    clip_range           | 0.2         |
|    entropy_loss         | -4.19       |
|    explained_variance   | 0.53        |
|    learning_rate        | 0.0003      |
|    loss                 | 1.24e+04    |
|    n_updates            | 480         |
|    policy_gradient_loss | -0.00832    |
|    value_loss           | 1.65e+04    |
-----------------------------------------
Applying Teacher-Guided Auxiliary Loss (sigma=1.00)...
<src.training.teacher_ppo.TeacherGuidedPPO at 0x7e10bfe8ed50>