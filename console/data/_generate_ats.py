#!/usr/bin/env python3
"""
Stratum Console · synthetic ATS data generator
-----------------------------------------------
Generates console/data/requisitions.json, candidates.json, ats_meta.json
on top of the existing people.json (Tessera Bank, 2,000 employees).

Run once from the console/data directory:
    cd console/data && python3 _generate_ats.py

Deterministic (seed 424243; offset +1 from people generator so the
employee universe is untouched).

Deliberately-seeded headlines (the four hiring demo answers):
  · 12 reqs stuck at offer (concentrated: Sales 5 / Engineering 4 / others 3)
  · 22 aging reqs (>45d open, no offer extended)
  · 6 on_hold reqs
  · Referrals convert 22% applied→accepted vs ~4% for agencies (5.5x)
  · Time-to-fill medians by dept: Eng 47d · Sales 31d · Product 62d · Design 78d
  · 4 offers-at-risk: predicted_accept > 0.7 AND days_in_stage > 7
"""

import json
import math
import random
import os
from datetime import date, timedelta

random.seed(424243)  # +1 offset from the people generator (424242)

SIM_DATE = date(2026, 5, 12)

HERE = os.path.dirname(os.path.abspath(__file__))

# ──────────────────────────────────────────────────────────── LOAD PEOPLE
with open(os.path.join(HERE, "people.json")) as f:
    PEOPLE = json.load(f)

PEOPLE_BY_ID = {p["id"]: p for p in PEOPLE}
RECRUITERS = [p for p in PEOPLE if p["department"] == "People"]
MANAGERS   = [p for p in PEOPLE if p["is_manager"]]
MANAGERS_BY_DEPT = {}
for m in MANAGERS:
    MANAGERS_BY_DEPT.setdefault(m["department"], []).append(m)

# ──────────────────────────────────────────────────────────── CONFIG
DEPT_MIX = [
    ("Engineering",      0.38),
    ("Sales",            0.18),
    ("Customer Success", 0.08),
    ("Product",          0.06),
    ("Design",           0.05),
    ("Finance",          0.05),
    ("Marketing",        0.05),
    ("People",           0.04),
    ("Operations",       0.04),
    ("IT/Security",      0.04),
    ("Legal",            0.03),
]

# Time-to-fill medians (days) per department — match demo answer headline.
TTF_MEDIAN = {
    "Engineering":      47,
    "Sales":            31,
    "Product":          62,
    "Design":           78,
    "Customer Success": 38,
    "Finance":          44,
    "Marketing":        40,
    "People":           36,
    "Operations":       42,
    "IT/Security":      50,
    "Legal":            55,
}

LEVEL_WEIGHTS = [
    ("IC2", 0.10), ("IC3", 0.24), ("IC4", 0.28), ("IC5", 0.18),
    ("IC6", 0.06), ("M1", 0.06), ("M2", 0.05), ("M3", 0.03),
]

BAND_P50 = {
    "IC1":  60000, "IC2":  85000, "IC3": 115000, "IC4": 150000,
    "IC5": 195000, "IC6": 250000, "IC7": 320000,
    "M1":  165000, "M2":  210000, "M3":  280000, "M4":  360000,
}

TITLES = {
    "Engineering": {
        "IC2": "Software Engineer", "IC3": "Software Engineer II",
        "IC4": "Senior Software Engineer", "IC5": "Staff Software Engineer",
        "IC6": "Principal Engineer",
        "M1": "Engineering Manager", "M2": "Senior Engineering Manager",
        "M3": "Director of Engineering",
    },
    "Sales": {
        "IC2": "Account Executive", "IC3": "Account Executive II",
        "IC4": "Senior Account Executive", "IC5": "Strategic Account Director",
        "IC6": "Principal Account Director",
        "M1": "Sales Manager", "M2": "Senior Sales Manager", "M3": "Director of Sales",
    },
    "Customer Success": {
        "IC2": "Customer Success Manager", "IC3": "Customer Success Manager II",
        "IC4": "Senior CSM", "IC5": "Strategic CSM", "IC6": "Principal CSM",
        "M1": "CS Manager", "M2": "Senior CS Manager", "M3": "Director of CS",
    },
    "Product": {
        "IC2": "Product Manager", "IC3": "Product Manager II",
        "IC4": "Senior Product Manager", "IC5": "Staff Product Manager",
        "IC6": "Principal Product Manager",
        "M1": "Group Product Manager", "M2": "Senior Group PM", "M3": "Director of Product",
    },
    "Design": {
        "IC2": "Product Designer", "IC3": "Product Designer II",
        "IC4": "Senior Product Designer", "IC5": "Staff Designer", "IC6": "Principal Designer",
        "M1": "Design Manager", "M2": "Senior Design Manager", "M3": "Director of Design",
    },
    "Finance": {
        "IC2": "Finance Analyst", "IC3": "Senior Finance Analyst",
        "IC4": "Finance Manager", "IC5": "Senior Finance Manager", "IC6": "Principal Finance",
        "M1": "Finance Manager", "M2": "Senior Finance Manager", "M3": "Director of Finance",
    },
    "Marketing": {
        "IC2": "Marketing Specialist", "IC3": "Marketing Manager",
        "IC4": "Senior Marketing Manager", "IC5": "Staff Marketing Lead", "IC6": "Principal Marketer",
        "M1": "Marketing Manager", "M2": "Senior Marketing Manager", "M3": "Director of Marketing",
    },
    "People": {
        "IC2": "People Operations Specialist", "IC3": "People Business Partner",
        "IC4": "Senior People Business Partner", "IC5": "Staff HRBP", "IC6": "Principal HRBP",
        "M1": "People Manager", "M2": "Senior People Manager", "M3": "Director, People",
    },
    "Operations": {
        "IC2": "Operations Specialist", "IC3": "Operations Manager",
        "IC4": "Senior Operations Manager", "IC5": "Staff Operations Lead", "IC6": "Principal Operations",
        "M1": "Ops Manager", "M2": "Senior Ops Manager", "M3": "Director of Operations",
    },
    "IT/Security": {
        "IC2": "IT Engineer", "IC3": "Senior IT Engineer", "IC4": "Security Engineer",
        "IC5": "Staff Security Engineer", "IC6": "Principal Security Engineer",
        "M1": "IT Manager", "M2": "Senior IT Manager", "M3": "Director, IT/Security",
    },
    "Legal": {
        "IC2": "Counsel I", "IC3": "Counsel II", "IC4": "Senior Counsel",
        "IC5": "Lead Counsel", "IC6": "Principal Counsel",
        "M1": "Legal Manager", "M2": "Senior Legal Manager", "M3": "Director of Legal",
    },
}

# Source mix per department — Engineering referral-heavy, Sales agency-heavy.
DEPT_SOURCE_MIX = {
    "Engineering":      [("referral", 0.38), ("inbound", 0.28), ("outbound", 0.22), ("agency", 0.10), ("event", 0.02)],
    "Sales":            [("agency", 0.40), ("outbound", 0.26), ("referral", 0.18), ("inbound", 0.14), ("event", 0.02)],
    "Product":          [("referral", 0.34), ("outbound", 0.28), ("inbound", 0.26), ("agency", 0.10), ("event", 0.02)],
    "Design":           [("referral", 0.36), ("inbound", 0.34), ("outbound", 0.18), ("agency", 0.10), ("event", 0.02)],
    "Customer Success": [("referral", 0.30), ("inbound", 0.30), ("outbound", 0.20), ("agency", 0.18), ("event", 0.02)],
    "Marketing":        [("referral", 0.28), ("inbound", 0.28), ("outbound", 0.24), ("agency", 0.18), ("event", 0.02)],
    "Finance":          [("referral", 0.28), ("inbound", 0.26), ("agency", 0.26), ("outbound", 0.18), ("event", 0.02)],
    "People":           [("referral", 0.32), ("inbound", 0.30), ("agency", 0.22), ("outbound", 0.14), ("event", 0.02)],
    "Operations":       [("referral", 0.26), ("inbound", 0.30), ("agency", 0.24), ("outbound", 0.18), ("event", 0.02)],
    "IT/Security":      [("referral", 0.32), ("inbound", 0.28), ("outbound", 0.22), ("agency", 0.16), ("event", 0.02)],
    "Legal":            [("agency", 0.36), ("referral", 0.28), ("inbound", 0.22), ("outbound", 0.12), ("event", 0.02)],
}

# Conversion biases per source — applied→screen→interview→offer→accepted.
# Crafted so the demo answer "referrals 22% accepted vs agencies 4%" holds.
SOURCE_CONV = {
    "referral": {"screen": 0.55, "interview": 0.78, "offer": 0.66, "accepted": 0.78},  # ≈ 22%
    "inbound":  {"screen": 0.15, "interview": 0.30, "offer": 0.36, "accepted": 0.62},  # ≈ 1.0%
    "outbound": {"screen": 0.30, "interview": 0.40, "offer": 0.40, "accepted": 0.58},  # ≈ 2.8%
    "agency":   {"screen": 0.32, "interview": 0.45, "offer": 0.42, "accepted": 0.66},  # ≈ 4.0%
    "event":    {"screen": 0.20, "interview": 0.35, "offer": 0.40, "accepted": 0.55},  # ≈ 1.5%
}

FIRST_NAMES = [
    "Liu","Aisha","Marco","Priya","Ade","Hassan","Sofia","Jin","Yara","Ezra",
    "Mei","Hiroshi","Tariq","Reem","Camila","Diego","Erik","Astrid","Anya","Pavel",
    "Giulia","Rohan","Anjali","Wei","Lara","Kemi","Tomás","Renata","Bo","Hua",
    "Mateo","Nadia","Ravi","Ingrid","Jonas","Lina","Khalid","Yusuf","Amina","Salma",
    "Olivia","Liam","Noa","Eitan","Kenji","Sakura","Niels","Maja","Saoirse","Connor",
    "Idris","Devon","Kofi","Abena","Yelena","Anastasia","Felipe","Adriana","Mauricio","Elena",
    "Tomasz","Magdalena","Bilal","Dalia","Karthik","Sneha","Rashida","Marcus","Tiana","Aaliyah",
    "Lucas","Emma","Henry","Sophie","Olu","Chen","Sergei","Vera","Mikhail","Irina",
]

LAST_NAMES = [
    "Chen","Patel","Kim","Garcia","Hernandez","Khan","Singh","Cohen","Levi","Rossi",
    "Tanaka","Wang","Li","Nguyen","Park","Lee","Choi","Andersson","Johansson","Schmidt",
    "Müller","Weber","De Vries","Bakker","Visser","O'Sullivan","Murphy","Walsh","Whitfield","Carter",
    "Hughes","Reed","Brooks","Bennett","Foster","Coleman","Hayes","Mensah","Boateng","Okonkwo",
    "Adeyemi","Diallo","Al-Rashid","Khoury","Haddad","Saleh","Sharma","Iyer","Reddy","Nair",
    "Kulkarni","Desai","Pillai","Banerjee","Watanabe","Sato","Tran","Pham","Lopez","Martinez",
    "Vasquez","Salazar","Cortez","Delgado","Petrov","Novak","Kovac","Wojcik","Ivanov","Smirnov",
    "Esposito","Bianchi","Romano","Greco","Papadopoulos","Karagiannis","Iqbal","Yousef","Möller","Lindberg",
]

COMPANIES = [
    "Stripe","Datadog","Snowflake","Vercel","Linear","Plaid","Coinbase","Shopify","Atlassian","Airbnb",
    "Asana","Notion","Figma","Canva","HashiCorp","Cloudflare","Twilio","Segment","MongoDB","Elastic",
    "Confluent","Airtable","Pinterest","Reddit","Block","Affirm","Klarna","Spotify","DeepMind","OpenAI",
    "Anthropic","Mistral","Hugging Face","Databricks","GitLab","GitHub","Brex","Mercury","Rippling","Ramp",
    "Wise","Revolut","Monzo","N26","Plate","Pipe","Vanta","Mux","PostHog","Modal Labs",
    "Local Bank","Regional Credit Union","BBVA","HSBC","Deutsche Bank","BNP Paribas","ING","SocGen","Lloyds","Barclays",
    "Goldman Sachs","JPMorgan","Morgan Stanley","Wells Fargo","Citi","BlackRock","Two Sigma","Jane Street",
    "Big 4 Consulting","Mid-tier Consulting","Boutique Consulting","University","Government","Self-employed",
]

CURRENT_TITLES = {
    "Engineering":      ["Software Engineer","Senior Software Engineer","Staff Engineer","Tech Lead","Principal Engineer","Backend Engineer","Platform Engineer","ML Engineer"],
    "Sales":            ["Account Executive","Senior AE","Strategic AE","Enterprise AE","Sales Director","Mid-Market AE","SDR Lead"],
    "Customer Success": ["CSM","Senior CSM","Strategic CSM","Customer Success Lead","Implementation Manager"],
    "Product":          ["Product Manager","Senior PM","Staff PM","Group PM","Product Lead"],
    "Design":           ["Product Designer","Senior Designer","Staff Designer","Design Lead","UX Designer"],
    "Finance":          ["Finance Manager","Senior Analyst","FP&A Manager","Controller","Treasury Analyst"],
    "Marketing":        ["Marketing Manager","Senior Marketing Manager","Demand Gen Lead","Brand Lead","PMM"],
    "People":           ["HRBP","Senior HRBP","People Operations","Recruiter","Talent Lead"],
    "Operations":       ["Operations Manager","Senior Ops","Business Ops Lead","Revenue Ops Manager"],
    "IT/Security":      ["Security Engineer","Senior Security Engineer","SecOps Lead","IT Manager"],
    "Legal":            ["Counsel","Senior Counsel","Lead Counsel","Commercial Counsel"],
}


def weighted(seq):
    total = sum(w for _, w in seq)
    r = random.random() * total
    acc = 0
    for item, w in seq:
        acc += w
        if r <= acc:
            return item
    return seq[-1][0]


def normal(mean, sd):
    u1, u2 = random.random(), random.random()
    z = math.sqrt(-2.0 * math.log(max(u1, 1e-9))) * math.cos(2 * math.pi * u2)
    return mean + z * sd


def pick_hiring_manager(dept):
    pool = MANAGERS_BY_DEPT.get(dept, []) or MANAGERS
    return random.choice(pool)


def pick_recruiter():
    return random.choice(RECRUITERS) if RECRUITERS else None


# ──────────────────────────────────────────────────────────── REQUISITIONS

def build_requisitions(target_n=140):
    reqs = []

    # First allocate across departments per DEPT_MIX
    dept_counts = {}
    for d, w in DEPT_MIX:
        dept_counts[d] = int(round(target_n * w))
    # Adjust to hit exactly target_n
    diff = target_n - sum(dept_counts.values())
    if diff != 0:
        dept_counts["Engineering"] += diff

    rid = 0
    for dept, count in dept_counts.items():
        for _ in range(count):
            rid += 1
            level = weighted(LEVEL_WEIGHTS)
            mgr = pick_hiring_manager(dept)
            rec = pick_recruiter()
            team = mgr["team"] if mgr["department"] == dept else random.choice(["Platform","Growth","Core"])
            location = mgr["location"]
            region = mgr["region"]
            remote = weighted([("hybrid", 0.55), ("remote", 0.30), ("on_site", 0.15)])

            band = BAND_P50.get(level, 150000)
            title_table = TITLES.get(dept, TITLES["Engineering"])
            base_title = title_table.get(level, level)
            title = f"{base_title} · {team}"

            # opened_date drawn from a per-dept normal centered on TTF_MEDIAN
            ttf_med = TTF_MEDIAN.get(dept, 45)
            days_open = max(2, int(normal(ttf_med, ttf_med * 0.45)))
            opened = SIM_DATE - timedelta(days=days_open)
            target_close = opened + timedelta(days=int(ttf_med * 1.2))

            req = {
                "id": f"REQ-{rid:05d}",
                "title": title,
                "department": dept,
                "team": team,
                "level": level,
                "location": location,
                "region": region,
                "remote": remote,
                "hiring_manager_id": mgr["id"],
                "recruiter_id": rec["id"] if rec else None,
                "comp_band_p50": band,
                "status": "open",
                "opened_date": opened.isoformat(),
                "target_close_date": target_close.isoformat(),
                "days_open": days_open,
                "priority": weighted([("standard", 0.62), ("high", 0.30), ("critical", 0.08)]),
                "stage_counts": {"applied": 0, "screen": 0, "interview": 0, "offer": 0, "accepted": 0},
                "bar_raisers_required": dept in ("Engineering", "Product"),
                "sla_status": "in_pace",
                # Internal flags for candidate-generation seeding:
                "_seeded_stuck_offer": False,
                "_seeded_aging": False,
                "_seeded_on_hold": False,
            }
            reqs.append(req)

    # ── Seed specific cohorts (deliberate distributions) ──
    by_dept = {}
    for r in reqs:
        by_dept.setdefault(r["department"], []).append(r)

    # 12 stuck-at-offer: 5 Sales + 4 Engineering + 1 Product + 1 CS + 1 Marketing
    stuck_plan = [("Sales", 5), ("Engineering", 4), ("Product", 1), ("Customer Success", 1), ("Marketing", 1)]
    for dept, n in stuck_plan:
        pool = by_dept.get(dept, [])
        random.shuffle(pool)
        for r in pool[:n]:
            r["_seeded_stuck_offer"] = True
            r["sla_status"] = "stuck"
            r["priority"] = "high"
            # Stretch days_open a bit
            r["days_open"] = max(r["days_open"], int(TTF_MEDIAN.get(dept, 45) * 0.9 + random.randint(0, 14)))
            r["opened_date"] = (SIM_DATE - timedelta(days=r["days_open"])).isoformat()

    # 22 aging: spread across departments where not already stuck
    aging_target = 22
    aging_pool = [r for r in reqs if not r["_seeded_stuck_offer"]]
    random.shuffle(aging_pool)
    aging_assigned = 0
    for r in aging_pool:
        if aging_assigned >= aging_target:
            break
        # bias toward higher-TTF departments
        if random.random() < (0.4 + 0.4 * (TTF_MEDIAN.get(r["department"], 45) / 80)):
            r["_seeded_aging"] = True
            r["sla_status"] = "aging"
            r["days_open"] = max(46, r["days_open"], 46 + random.randint(0, 35))
            r["opened_date"] = (SIM_DATE - timedelta(days=r["days_open"])).isoformat()
            aging_assigned += 1

    # 6 on_hold
    on_hold_pool = [r for r in reqs if not r["_seeded_stuck_offer"] and not r["_seeded_aging"]]
    random.shuffle(on_hold_pool)
    for r in on_hold_pool[:6]:
        r["_seeded_on_hold"] = True
        r["status"] = "on_hold"
        r["sla_status"] = "aging"

    # ~9 filled in last 30d (status=filled, with a date)
    filled_pool = [r for r in reqs if not (r["_seeded_stuck_offer"] or r["_seeded_aging"] or r["_seeded_on_hold"])]
    random.shuffle(filled_pool)
    for r in filled_pool[:9]:
        r["status"] = "filled"
        # Use a smaller days_open consistent with department TTF
        ttf = TTF_MEDIAN.get(r["department"], 45)
        r["days_open"] = max(10, int(normal(ttf, ttf * 0.3)))
        r["opened_date"] = (SIM_DATE - timedelta(days=r["days_open"] + random.randint(2, 28))).isoformat()
        r["sla_status"] = "in_pace"

    return reqs


# ──────────────────────────────────────────────────────────── CANDIDATES

def slug_email(given, family, i):
    base = (given + "." + family).lower()
    for ch in [" ", "'", "-", "ç","á","é","í","ó","ú","ñ","ü","ö","ä","å","ø","ã","ô","ê","è","ï","î","æ"]:
        base = base.replace(ch, "")
    base = "".join(c for c in base if c.isascii() and (c.isalnum() or c == "."))
    return f"{base}{i}@example.invalid"


def pick_source_for_dept(dept):
    return weighted(DEPT_SOURCE_MIX.get(dept, DEPT_SOURCE_MIX["Engineering"]))


def stage_progression_for(source):
    """Walk applied→screen→interview→offer→accepted/rejected stochastically
    using SOURCE_CONV probabilities. Returns (final_stage, history_stages).
    The candidate "stops" at whichever stage they failed to progress past."""
    conv = SOURCE_CONV[source]
    if random.random() < conv["screen"]:
        if random.random() < conv["interview"]:
            if random.random() < conv["offer"]:
                if random.random() < conv["accepted"]:
                    return "accepted", ["applied","screen","interview","offer","accepted"]
                else:
                    return "offer", ["applied","screen","interview","offer"]
            return "interview", ["applied","screen","interview"]
        return "screen", ["applied","screen"]
    return "applied", ["applied"]


def build_candidates(reqs):
    cands = []
    cid = 0
    movement_log = []  # for the Movement ticker

    # Allocate ~3500 candidates across the 140 reqs (~25 each, with variation)
    target_total = 3500
    base_each = target_total // len(reqs)

    for req in reqs:
        if req["status"] == "filled":
            n_for_req = base_each + random.randint(-3, 5)
        elif req["status"] == "on_hold":
            n_for_req = max(5, int(base_each * 0.4))
        elif req["_seeded_stuck_offer"]:
            n_for_req = base_each + random.randint(0, 8)
        elif req["_seeded_aging"]:
            n_for_req = base_each + random.randint(2, 10)
        else:
            n_for_req = base_each + random.randint(-5, 7)

        dept = req["department"]
        for k in range(n_for_req):
            cid += 1
            given = random.choice(FIRST_NAMES)
            family = random.choice(LAST_NAMES)
            display = f"{given} {family}"
            source = pick_source_for_dept(dept)

            # Choose a referrer if source is referral
            referrer_id = None
            source_detail = None
            is_referral = source == "referral"
            if is_referral:
                # Bias referrer to be in same department; falls back to random.
                pool = [p for p in PEOPLE if p["department"] == dept] or PEOPLE
                referrer = random.choice(pool)
                referrer_id = referrer["id"]
                source_detail = f"{referrer['display_name']} ({referrer['id']})"

            # Stage walk based on source
            final_stage, history = stage_progression_for(source)

            # Internal flag handling for the seeded distributions
            # · stuck-at-offer reqs → force at least a few candidates into stage=offer with days_in_stage > 7
            # · aging reqs → no offers extended (cap at interview/screen)
            if req["_seeded_stuck_offer"] and k < 3:
                # First 3 candidates of these reqs: force into 'offer' stage, stuck
                final_stage = "offer"
                history = ["applied","screen","interview","offer"]
            elif req["_seeded_aging"] and final_stage in ("offer","accepted"):
                final_stage = "interview"
                history = ["applied","screen","interview"]
            elif req["status"] == "filled" and final_stage != "accepted" and k == 0:
                # Each filled req has one accepted candidate
                final_stage = "accepted"
                history = ["applied","screen","interview","offer","accepted"]

            # Compute stage_entered + days_in_stage
            # Anchor to req opened_date; later stages happened later in the funnel.
            req_open = date.fromisoformat(req["opened_date"])
            base_days_after_open = {
                "applied":   random.randint(0, max(1, req["days_open"])),
                "screen":    random.randint(2, max(3, req["days_open"])),
                "interview": random.randint(7, max(8, req["days_open"])),
                "offer":     random.randint(14, max(15, req["days_open"])),
                "accepted":  random.randint(18, max(19, req["days_open"])),
            }[final_stage]
            entered = req_open + timedelta(days=base_days_after_open)
            if entered > SIM_DATE:
                entered = SIM_DATE - timedelta(days=random.randint(0, 3))
            days_in_stage = (SIM_DATE - entered).days

            # Override for stuck-at-offer: days_in_stage > 7
            if req["_seeded_stuck_offer"] and final_stage == "offer":
                days_in_stage = max(8, days_in_stage, 8 + random.randint(0, 14))
                entered = SIM_DATE - timedelta(days=days_in_stage)

            # Rejected branch: 92% of applied are auto-rejected at screen.
            rejected_reason = None
            if final_stage == "applied" and random.random() < 0.92:
                final_stage = "rejected"
                rejected_reason = random.choice(["not_advancing","not_responding","other"])
            elif final_stage == "screen" and random.random() < 0.45:
                # Some screen-stage candidates rejected outright
                if random.random() < 0.6:
                    final_stage = "rejected"
                    rejected_reason = "not_advancing"
            # A tiny fraction withdraw
            if random.random() < 0.012 and final_stage not in ("accepted","rejected"):
                final_stage = "withdrew"
                rejected_reason = None

            # Compensation expectations
            level_band = req["comp_band_p50"]
            expected_comp = int(round(level_band * random.uniform(0.92, 1.18) / 500.0) * 500)
            offered_comp = None
            if final_stage in ("offer","accepted"):
                # Offered comp close to band
                offered_comp = int(round(level_band * random.uniform(0.95, 1.10) / 500.0) * 500)

            # Predicted accept probability (used for "offers at risk")
            if final_stage in ("offer","accepted"):
                # Higher for referrals; lower if comp gap
                base_p = 0.55
                if source == "referral":
                    base_p += 0.15
                elif source == "agency":
                    base_p -= 0.05
                comp_ratio = (offered_comp or level_band) / level_band
                if comp_ratio >= 1.0:
                    base_p += 0.10
                else:
                    base_p -= 0.18 * (1 - comp_ratio)
                base_p += random.uniform(-0.12, 0.12)
                predicted_accept = max(0.05, min(0.96, base_p))
            else:
                predicted_accept = round(max(0.05, min(0.95, normal(0.55, 0.15))), 2)

            # Scorecards (only stages reached)
            scorecards = []
            if "screen" in history:
                scorecards.append({
                    "stage": "screen",
                    "interviewer_id": req["recruiter_id"],
                    "recommend": "advance" if final_stage not in ("rejected","screen") or random.random() < 0.5 else "no_hire",
                    "score": round(random.uniform(3.0, 4.6), 1),
                })
            if "interview" in history:
                scorecards.append({
                    "stage": "interview",
                    "interviewer_id": req["hiring_manager_id"],
                    "recommend": "advance" if final_stage in ("interview","offer","accepted") else "no_hire",
                    "score": round(random.uniform(2.8, 4.5), 1),
                })

            # Self-id diversity (sometimes null, ~25%)
            if random.random() < 0.75:
                gender = random.choices(["F","M","NB"], weights=[0.46, 0.51, 0.03])[0]
                ethnicity = random.choice(["asian","black","hispanic","white","mena","mixed","other"])
                veteran = random.random() < 0.07
                diversity = {"gender": gender, "ethnicity": ethnicity, "veteran": veteran}
            else:
                diversity = None

            # Highest level indicated (heuristic from req level)
            level_indicated = req["level"]

            country_code = mgr_country_for_location(req["location"])

            cand = {
                "id": f"CAND-{cid:08d}",
                "given_name": given,
                "family_name": family,
                "display_name": display,
                "email": slug_email(given, family, cid),
                "current_title": random.choice(CURRENT_TITLES.get(dept, CURRENT_TITLES["Engineering"])),
                "current_company": random.choice(COMPANIES),
                "total_experience_years": round(max(0.5, normal(7.0, 3.5)), 1),
                "highest_level_indicated": level_indicated,
                "location_preference": f"{req['location']} / {req['remote'].replace('_',' ').title()}",
                "country": country_code,
                "source": source,
                "source_detail": source_detail,
                "requisition_id": req["id"],
                "stage": final_stage,
                "stage_entered": entered.isoformat(),
                "days_in_stage": days_in_stage,
                "rejected_reason": rejected_reason,
                "scorecards": scorecards,
                "diversity_self_id": diversity,
                "expected_comp": expected_comp,
                "offered_comp": offered_comp,
                "is_internal": random.random() < 0.05,
                "is_referral": is_referral,
                "referrer_id": referrer_id,
                "flight_risk_at_current_employer": round(max(0.05, min(0.95, normal(0.45, 0.18))), 2),
                "predicted_offer_acceptance_probability": round(predicted_accept, 2),
            }
            cands.append(cand)

            # Update stage_counts on the req. Each candidate counts once at their
            # current stage (rejected/withdrew not counted in stage_counts).
            if final_stage in req["stage_counts"]:
                req["stage_counts"][final_stage] += 1

            # Movement log: candidates who moved within last 7 days
            if days_in_stage <= 7 and final_stage in ("screen","interview","offer","accepted"):
                movement_log.append({
                    "candidate_id": cand["id"],
                    "display_name": display,
                    "stage": final_stage,
                    "requisition_id": req["id"],
                    "requisition_title": req["title"],
                    "department": dept,
                    "days_ago": days_in_stage,
                    "entered": entered.isoformat(),
                })

    # ── Targeted seeding: exactly 4 offers at risk (predicted > 0.7, days > 7) ──
    offer_cands = [c for c in cands if c["stage"] == "offer"]
    # Sort by current predicted_accept desc; bump top 4 to ensure >0.7 and days_in_stage > 7
    offer_cands.sort(key=lambda c: -c["predicted_offer_acceptance_probability"])
    risky = []
    for c in offer_cands:
        if len(risky) >= 4:
            break
        c["predicted_offer_acceptance_probability"] = round(random.uniform(0.72, 0.88), 2)
        c["days_in_stage"] = max(8, c["days_in_stage"], 8 + random.randint(0, 6))
        c["stage_entered"] = (SIM_DATE - timedelta(days=c["days_in_stage"])).isoformat()
        risky.append(c)

    # Dampen all other "offer" predicted accept to <= 0.7 to keep the n=4 clean
    risky_ids = {c["id"] for c in risky}
    for c in offer_cands:
        if c["id"] not in risky_ids and c["predicted_offer_acceptance_probability"] > 0.70:
            c["predicted_offer_acceptance_probability"] = round(random.uniform(0.45, 0.69), 2)

    return cands, movement_log


def mgr_country_for_location(loc):
    table = {
        "London":"GB","Berlin":"DE","Paris":"FR","Madrid":"ES","Amsterdam":"NL","Dublin":"IE",
        "New York":"US","San Francisco":"US","Austin":"US","Toronto":"CA","Chicago":"US","Atlanta":"US",
        "Singapore":"SG","Sydney":"AU","Tokyo":"JP","Bangalore":"IN","São Paulo":"BR","Mexico City":"MX",
    }
    return table.get(loc, "US")


# ──────────────────────────────────────────────────────────── ATS META

def build_meta(reqs, cands):
    open_n = sum(1 for r in reqs if r["status"] == "open")
    filled_30d = sum(1 for r in reqs if r["status"] == "filled")
    stage_dist = {"applied":0,"screen":0,"interview":0,"offer":0,"accepted":0,"rejected":0,"withdrew":0}
    for c in cands:
        if c["stage"] in stage_dist:
            stage_dist[c["stage"]] += 1
    # Median TTF for filled-or-with-accepted reqs
    filled = [r for r in reqs if r["status"] == "filled"]
    if filled:
        days = sorted(r["days_open"] for r in filled)
        med_ttf = days[len(days)//2]
    else:
        # use overall median days_open for non-on_hold reqs
        days = sorted(r["days_open"] for r in reqs if r["status"] != "on_hold")
        med_ttf = days[len(days)//2] if days else 41

    # Median days in stage
    by_stage = {"applied":[],"screen":[],"interview":[],"offer":[]}
    for c in cands:
        if c["stage"] in by_stage:
            by_stage[c["stage"]].append(c["days_in_stage"])
    med_in_stage = {}
    for k, vs in by_stage.items():
        vs.sort()
        med_in_stage[k] = vs[len(vs)//2] if vs else 0

    return {
        "as_of": SIM_DATE.isoformat(),
        "total_requisitions": len(reqs),
        "open_requisitions": open_n,
        "filled_last_30d": filled_30d,
        "total_candidates_in_pipeline": sum(1 for c in cands if c["stage"] in stage_dist and c["stage"] not in ("rejected","withdrew")),
        "total_candidates_all": len(cands),
        "stage_distribution": stage_dist,
        "median_time_to_fill": med_ttf,
        "median_time_in_stage": med_in_stage,
    }


# ──────────────────────────────────────────────────────────── MAIN

def main():
    reqs = build_requisitions(140)
    cands, movement = build_candidates(reqs)

    # Strip internal flags
    for r in reqs:
        r.pop("_seeded_stuck_offer", None)
        r.pop("_seeded_aging", None)
        r.pop("_seeded_on_hold", None)

    # Write
    with open(os.path.join(HERE, "requisitions.json"), "w") as f:
        json.dump(reqs, f, separators=(",", ":"))
    with open(os.path.join(HERE, "candidates.json"), "w") as f:
        json.dump(cands, f, separators=(",", ":"))
    meta = build_meta(reqs, cands)
    # Also stash a recent-movement ticker (top 30 most recent)
    movement.sort(key=lambda m: m["days_ago"])
    meta["movement_recent"] = movement[:30]
    with open(os.path.join(HERE, "ats_meta.json"), "w") as f:
        json.dump(meta, f, indent=2)

    # ── Verification prints (must match the four demo headlines) ──
    print(f"\nrequisitions.json: {len(reqs)} reqs")
    print(f"candidates.json:   {len(cands)} candidates")
    print(f"ats_meta.json:     written")

    # 1. Stuck-at-offer breakdown
    stuck = [r for r in reqs if r["sla_status"] == "stuck"]
    stuck_by_dept = {}
    for r in stuck:
        stuck_by_dept[r["department"]] = stuck_by_dept.get(r["department"], 0) + 1
    print(f"\n[Q1] Stuck reqs (sla_status=stuck): {len(stuck)}")
    for d, n in sorted(stuck_by_dept.items(), key=lambda kv: -kv[1]):
        print(f"      {d}: {n}")

    # 2. Source conversion: referral vs agency
    by_source = {}
    for c in cands:
        by_source.setdefault(c["source"], []).append(c)
    print(f"\n[Q2] Source applied→accepted conversion:")
    for src in ("referral","inbound","outbound","agency","event"):
        ss = by_source.get(src, [])
        n = len(ss)
        acc = sum(1 for c in ss if c["stage"] == "accepted")
        offered = sum(1 for c in ss if c["stage"] in ("offer","accepted"))
        rate = (acc / n * 100) if n else 0
        offer_rate = (offered / n * 100) if n else 0
        print(f"      {src:9s}: n={n:5d} · offered={offered:4d} ({offer_rate:.1f}%) · accepted={acc:4d} ({rate:.1f}%)")

    # 3. Time-to-fill per department
    print(f"\n[Q3] Median time-to-fill by department (filled or open):")
    by_dept = {}
    for r in reqs:
        if r["status"] in ("filled","open"):
            by_dept.setdefault(r["department"], []).append(r["days_open"])
    for d, days in sorted(by_dept.items()):
        if not days: continue
        days_s = sorted(days)
        med = days_s[len(days_s)//2]
        print(f"      {d:18s}: median {med}d · n={len(days)}")

    # 4. Offers at risk (predicted > 0.7 AND days_in_stage > 7 AND stage=offer)
    at_risk = [c for c in cands
               if c["stage"] == "offer"
               and c["predicted_offer_acceptance_probability"] > 0.70
               and c["days_in_stage"] > 7]
    print(f"\n[Q4] Offers at risk (stage=offer, predicted>0.70, days>7): {len(at_risk)}")
    for c in at_risk[:6]:
        req = next((r for r in reqs if r["id"] == c["requisition_id"]), None)
        print(f"      {c['id']} · {req['title'] if req else '?'} · {c['days_in_stage']}d · p={c['predicted_offer_acceptance_probability']}")

    # Source aggregate totals
    print(f"\nStage distribution: {meta['stage_distribution']}")
    print(f"Median TTF (filled set): {meta['median_time_to_fill']}d")


if __name__ == "__main__":
    main()
