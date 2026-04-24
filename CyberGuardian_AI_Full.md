# CyberGuardian AI - Full Simple Guide

We built a security system where two AIs - one playing a hacker, one playing a guard - fought each other a million times until both got really smart.
Now when a real attack happens, the guard AI watches the live camera feeds, spots suspicious patterns across the whole building at once, and puts up a countdown clock showing exactly how much time is left before the hacker reaches the important files.
It also figures out: which famous hacker group this looks like, and gives the security team a step-by-step plan to stop it.

## The Big Idea

Imagine your office building has 20 rooms.
Some rooms are easy to enter, some are normal work rooms, and a few hold the most important company files.

A burglar is trying to:

- sneak in,
- try locks,
- tiptoe from room to room,
- and steal the important files without getting caught.

Our red AI plays the burglar.
Our blue AI plays the guard.

Instead of waiting for a real attack to happen, we let both of them play this cat-and-mouse game again and again until the guard got much smarter.

## What Makes It Cool

### 1. You watch the attack live

The app does not feel like reading a boring spreadsheet.
It feels like a command room screen:

- the building map glows,
- suspicious rooms pulse,
- danger lines and alerts appear live,
- and the story updates step by step.

### 2. The app shows time pressure

One of the strongest parts of the project is the countdown clock.
It answers a very simple question:

"If nobody stops this burglar, how long until the important files are reached?"

### 3. The app explains itself

Instead of saying "trust the AI," the app shows:

- what room looks dangerous,
- how sure the AI is,
- what kind of attack this looks like,
- and what the security team should do next.

## What Each Page Shows

### Live Page

This is the main demo page.
It shows:

- the map of all the computers,
- who is in danger right now,
- the connect box for the live practice run,
- the Threat Radar,
- and the Intrusion Storyboard.

### Battle Page

This page shows the red AI and blue AI like two players in a match.
You can see:

- who is winning,
- what each side just did,
- and how the score changes over time.

### Pipeline Page

This page shows the app thinking through the problem in stages.
A judge does not need the deep math here.
The important idea is:

- first the app notices something strange,
- then it checks what might happen next,
- then it picks the best guard move,
- and finally it writes the response plan.

### Attack Path Page

This page answers:

- where the burglar is heading,
- which route is most dangerous,
- how many moves are left before the safe,
- and how much valuable data is at risk.

### Playbooks Page

This is the "what do we do now?" page.
It gives the team a step-by-step response plan in plain language and command form.

### Training Page

This page proves the guard did not get smart by luck.
It shows that the two AIs practiced this game a huge number of times and improved over time.

## The Two New Visual Features

### Threat Radar

This is the flashy circular scanner judges will notice immediately.
It sweeps around the map and lights up the hottest computers in the building.

Why it matters:

- it gives an instant "where should I look?" answer,
- it is easy to understand in two seconds,
- and it looks impressive on a big screen.

### Intrusion Storyboard

This is a visual story reel of the attack.
Each card says what just happened, who did it, and why it matters.

Why it matters:

- it turns messy security events into a simple story,
- it helps non-technical judges follow the demo,
- and it makes the app feel more alive.

## The Backend Improvement

### Upload a security feed and start from a realistic scene

We added a backend feature that lets the app take a security feed file and use it to set up the next run.
That means the demo can begin with danger already on the map, which makes the story faster and more realistic for judges.

## Threat Names In Plain English

- Brute Force: trying lots of keys on the same lock until one works.
- Lateral Movement: the burglar leaves one room and sneaks into the next.
- Data Exfiltration: the burglar grabs the files and sneaks them outside.
- C2 Beaconing: the hidden bad software keeps secretly texting its boss.
- False Positive: the alarm went off, but it was not really a burglar.

## What Judges Should Remember

If a judge only remembers three things, they should remember this:

1. This app shows a cyber attack live instead of showing logs after the damage.
2. It predicts where the attacker goes next and how much time is left.
3. It gives a clear response plan instead of just shouting "something is wrong."

## Best One-Minute Explanation

"Think of this like a smart building security game.
One AI learned how to play the burglar, one AI learned how to play the guard, and they practiced against each other a million times.
Now the guard can spot trouble faster, predict the burglar's next move, show the danger live on screen, and tell the human team exactly how to respond."

## Run Commands

```bash
cd /Abhi/Projects/Athernex
npm install
npm run dev
```

```bash
cd /Abhi/Projects/Athernex
./.venv311/bin/python -m uvicorn backend.src.api.main:app --host 127.0.0.1 --port 8001
```

## Final Mental Picture

Do not think of CyberGuardian as a pile of security logs.
Think of it as a live building defense screen where:

- the burglar is moving,
- the guard is reacting,
- the radar is sweeping,
- the countdown clock is ticking,
- and the team gets a plan before the safe is reached.
