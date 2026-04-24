# CyberGuardian AI

We built a security system where two AIs - one playing a hacker, one playing a guard - fought each other a million times until both got really smart.
Now when a real attack happens, the guard AI watches the live camera feeds, spots suspicious patterns across the whole building at once, and puts up a countdown clock showing exactly how much time is left before the hacker reaches the important files.
It also figures out: which famous hacker group this looks like, and gives the security team a step-by-step plan to stop it.

## The Simple Version

Imagine a school building with 20 rooms.
Some rooms are normal classrooms, some are offices, and a few are the room with the most valuable stuff inside.

Now imagine a burglar trying to sneak in, try keys, slip from room to room, and steal the files before anyone notices.
Our project turns that into a live game:

- The red AI is the burglar.
- The blue AI is the guard.
- They practiced against each other a million times.
- The screen shows the whole building map live, so you can watch the chase happen room by room.

## What You See On Screen

### Live War Room

- A glowing map of all the computers in the building.
- Red danger flashes when the burglar is pushing into a room.
- Blue guard actions when the system locks down, checks, or blocks a machine.
- A sweeping Threat Radar that lights up the hottest trouble spots.
- An Intrusion Storyboard that explains the chase as a short visual story.

### Breach Countdown

- A big countdown clock that answers the question judges care about most:
  how long until the burglar reaches the safe if nobody stops them?

### Burglar Route Prediction

- The app draws the likely next path the burglar may take.
- It highlights the rooms that matter most before the damage happens.

### Guard Playbook

- When the app catches something bad, it writes a step-by-step response plan.
- That means the guard team sees what to do next, not just a flashing warning.

### AI Trust Check

- The app also checks whether its own guard AI is being fooled too easily.
- That matters because a smart alarm is only useful if it does not panic at the wrong things.

## The New Judge-Friendly Features

### 1. Threat Radar

This is a big circular scanner that sweeps around like a movie radar screen.
Each glowing dot is a computer that looks risky, and the brighter the dot, the hotter the danger.

### 2. Intrusion Storyboard

This turns the attack into a visual comic strip.
Instead of making judges read raw logs, it shows who moved, what happened, and why it matters.

### 3. Backend Improvement: SIEM Feed Upload Seeding

You can now upload a security feed file and the app uses it to seed the next practice run.
That means the demo can start from a more realistic "the burglar is already inside" situation instead of always starting from zero.

## Scary Words, Explained Like Real Life

- Brute Force: like trying a giant ring of keys until one opens the door.
- Lateral Movement: the burglar got into one room and is now tiptoeing to the next.
- Data Exfiltration: the burglar found the files and is sneaking them out.
- C2 Beaconing: the burglar's hidden tool is secretly texting its boss to say, "I am still here."
- False Positive: the alarm went off, but it was just the janitor moving something.

## Why This Project Feels Different

Most security tools act like a notebook of old warnings.
They tell you what already happened.

CyberGuardian feels more like a live security room in a movie:

- you see the burglar moving,
- you see the guard reacting,
- you see which rooms are in danger,
- and you see how much time is left before the important files are reached.

## How To Run It

### Frontend

```bash
cd /Abhi/Projects/HACKMALANADU
npm install
npm run dev
```

Open the local address shown by Vite.

### Backend

```bash
cd /Abhi/Projects/HACKMALANADU
./.venv311/bin/python -m uvicorn backend.src.api.main:app --host 127.0.0.1 --port 8001
```

The app expects the backend at `http://127.0.0.1:8001`.

## Best Demo Flow

1. Open `/live`.
2. Show the building map and explain that red is the burglar and blue is the guard.
3. Point at the Threat Radar and Intrusion Storyboard.
4. Step the practice run forward and show the countdown clock.
5. Open the attack path and response plan pages to show prediction plus action.

## 30-Second Judge Pitch

"Imagine a building with 20 rooms and one burglar trying to reach the safe.
We trained one AI to play the burglar and another AI to play the guard a million times, so now the guard has seen almost every trick before.
Instead of showing boring logs after the damage is done, our app shows the attack live, predicts where the burglar goes next, tells you how much time is left, and gives the team a clear plan to stop it."
