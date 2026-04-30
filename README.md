# 🩺 Bios

Log meals, workouts, and daily health habits by chatting with Claude. No forms, no dashboards — just tell Claude what you ate or did.

```
You: just did push and light legs, ~50min
Claude: logged — Monday push (moderate, 50min)

You: had chicken tikka with 65g protein
Claude: logged — 700kcal, 65g, you're at 95g/150g for the day

You: how am I tracking this week?
Claude: 3/5 workouts done, calories on track (1850/2500), protein behind (95/150).
```

---

## ⚡ Get Started

1. **Add the connector**
   Open [Claude → Connectors](https://claude.ai/settings/connectors), click **+ Add custom connector**, and paste:
   `https://bios.mealfix.club/mcp`

2. **Sign in with Google**
   Claude pops a Google sign-in. Pick your account and you're connected.

3. **Set your goals**
   > *"My daily calorie goal is 2500 kcal and protein goal is 170g"*

4. **Start logging**
   > *"I had 2 eggs and toast for breakfast"*
   > *"Just finished a pull day at the gym"*

> **Tip:** in the connector settings, set Read-only and Write/delete tools to **"Always allow"** — otherwise Claude asks before every log.

---

## 🍽️ What You Can Do

### Log meals
Describe what you ate — Claude estimates the portion and macros, then **confirms before saving**.

> *"Had a chicken burger and fries for lunch"*
> *"2 scoops of whey in milk post workout"*

### Track workouts
> *"Did push day today"*
> *"Went for a 5k run this morning"*
> *"Rest day"*

Supports: Push · Pull · Legs · Run · Walk · Rest · Mixed · Other

### Set daily targets
> *"Set my protein goal to 150g per day"*
> *"Aim for 4 workouts a week"*

### Log anything else
Supplements, mood, sleep, energy.

> *"Took creatine pre-workout"*
> *"Slept 6 hours last night"*

### Check your day or week
> *"What did I eat today?"*
> *"How am I tracking against my goals?"*
> *"Show me this week's workouts"*

---

## 📊 Example day

| Meal | Calories | Protein | Carbs | Fat |
|------|----------|---------|-------|-----|
| 2-egg omelette + bread + chaas | 400 kcal | 23g | 42g | 15g |
| White chicken + rice | 650 kcal | 45g | 75g | 12g |
| **Total** | **1050 kcal** | **68g** | **117g** | **27g** |

---

## 🙋 FAQ

**Do I need to log exact quantities?**
No. Claude proposes a reasonable portion and confirms with you before saving — just correct it if it's off.

**Can I log past meals?**
Yes. Just mention the time — *"I had oats around 8am"*.

**Is my data private?**
Yes. Each user has their own isolated account; your logs are only visible to you.

---

## 🔧 Self-hosting

Want to run your own instance? Runs on Cloudflare Workers + D1 (free tier indefinitely for solo or small-group use). See [SETUP.md](SETUP.md).

---

MIT licensed. Built on [Claude](https://claude.ai) + [MCP](https://modelcontextprotocol.io) + [Cloudflare Workers](https://workers.cloudflare.com).
