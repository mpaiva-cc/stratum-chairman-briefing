#!/usr/bin/env python3
"""
Stratum Console · synthetic data generator
-------------------------------------------
Generates console/data/people.json (2000 employees) and console/data/orgs.json.

Run once from the console/data directory:
    cd console/data && python3 _generate.py

The output is deterministic (seeded) so the demo numbers are reproducible.

Deliberate seeded patterns (the questions the Console answers):
  · 4.5% pay gap: women at IC5/IC6/M3 in EMEA paid below their men peers
  · ~12% flight-risk cohort (high band) concentrated where you'd expect:
      newer joiners, comp-below-band, partially-meets reviewers, missed promos
  · Engineering median tenure ~2.6 years globally
  · Manager spans 4-15 with a few hot-spots above 12 (the "too many directs")
  · Underpaid high-performers: ~85 employees with performance_score >= 4 and
    comp_ratio < 0.85
"""

import json
import math
import random
import os
from datetime import date, timedelta

random.seed(424242)

SIM_DATE = date(2026, 5, 12)  # "today" for the simulation

# ──────────────────────────────────────────────────────────── NAMES
# Names span several origins. Mixed cases, mixed lengths.
GIVEN_NAMES = [
    # West African / Black diaspora
    "Aisha","Chinwe","Ade","Kwame","Folake","Nnamdi","Tunde","Omolara","Femi","Yara",
    "Kofi","Abena","Sade","Bayo","Ifeoma","Kemi","Obi","Zola","Anika","Jelani",
    # Arabic / Levantine
    "Hassan","Layla","Omar","Noor","Rami","Yasmin","Khalid","Amina","Tariq","Salma",
    "Fadi","Lina","Ziad","Hana","Karim","Reem","Bilal","Dalia","Fares","Maya",
    # South Asian
    "Priya","Arjun","Neha","Rohan","Anjali","Vikram","Meera","Ravi","Divya","Karthik",
    "Asha","Rahul","Sneha","Kiran","Pooja","Sanjay","Tanvi","Aditya","Lakshmi","Manish",
    "Devi","Suresh","Nikhil","Anaya","Vivek",
    # East Asian
    "Wei","Mei","Jin","Hiroshi","Yuki","Kenji","Takashi","Sakura","Haruto","Akira",
    "Jiwoo","Minji","Seojun","Hyejin","Daiki","Aoi","Ren","Sora","Mina","Tomo",
    "Xiao","Lin","Hua","Bo","Fang","Qian","Yifei","Ziyi",
    # Latin American / Iberian
    "Sofia","Mateo","Lucia","Diego","Camila","Joaquin","Valentina","Andres","Isabella","Mauricio",
    "Elena","Tomás","Renata","Felipe","Ximena","Rodrigo","Paloma","Cristian","Antonia","Esteban",
    "Carmen","Eduardo","Daniela","Hugo","Adriana",
    # Northern / Central European
    "Erik","Astrid","Lars","Ingrid","Niels","Maja","Soren","Sigrid","Henrik","Freya",
    "Klaus","Hannelore","Stefan","Petra","Anders","Birgit","Mikael","Karin","Otto","Greta",
    "Pieter","Saskia","Wouter","Janneke","Jonas","Linnea",
    # Anglo
    "James","Olivia","William","Emma","Benjamin","Charlotte","Henry","Amelia","Theo","Eleanor",
    "Oliver","Sophie","Jack","Grace","Daniel","Hannah","Samuel","Lily","Nathan","Chloe",
    "Caleb","Naomi","Zachary","Madeleine","Ethan","Phoebe",
    # Slavic / Baltic
    "Dmitri","Anastasia","Pavel","Katarzyna","Tomasz","Magdalena","Sergei","Yelena","Mikhail","Irina",
    "Jakub","Anya","Vladislav","Olga","Bogdan","Zofia","Nikolai","Daria","Andrei","Vera",
    # Mediterranean
    "Giulia","Marco","Chiara","Luca","Beatrice","Matteo","Federica","Giuseppe","Francesca","Pietro",
    "Eleni","Nikos","Maria","Stavros","Despina","Yannis",
    # Hebrew / Jewish
    "Avi","Tamar","Itamar","Noa","Eitan","Shira","Yael","Daniel","Maayan","Roi",
    # Indigenous / additional
    "Talia","Iris","Jasmine","Maxim","Lila","Ezra","Cassandra","Rashida","Jorge","Imani",
    "Marcus","Tiana","Devon","Yusuf","Aaliyah","Idris","Naveen","Saoirse","Connor","Aoife",
]

FAMILY_NAMES = [
    # West African / Black diaspora
    "Okonkwo","Adeyemi","Hassan","Diallo","Oduya","Mensah","Achterberg","Nwosu","Boateng","Mbeki",
    "Osei","Asante","Owusu","Konaté","Diop","Camara","Touré","Bah","Sissoko","Keita",
    # Arabic
    "Al-Rashid","Khoury","Haddad","Saleh","Mansour","Najjar","Khalil","Aziz","Farah","Sayed",
    "Nasser","Tahir","Younes","Rahman","Bakr","Ibrahim",
    # South Asian
    "Patel","Sharma","Iyer","Reddy","Rao","Khan","Singh","Kapoor","Mehta","Nair",
    "Chakraborty","Banerjee","Kulkarni","Desai","Pillai","Joshi","Subramanian","Krishnan","Bose","Saxena",
    "Gupta","Aggarwal","Malhotra","Sinha",
    # East Asian
    "Watanabe","Tanaka","Yamamoto","Kobayashi","Suzuki","Sato","Kim","Park","Lee","Choi",
    "Wang","Chen","Li","Zhang","Liu","Yang","Wu","Lin","Huang","Zhao",
    "Nguyen","Tran","Pham","Hoang","Vu",
    # Latin American / Iberian
    "García","Rodríguez","Martínez","López","González","Hernández","Pérez","Sánchez","Ramírez","Torres",
    "Flores","Rivera","Gómez","Díaz","Reyes","Cruz","Morales","Ortiz","Gutiérrez","Castillo",
    "Vargas","Romero","Mendoza","Silva","Castro","Rojas","Aguilar","Medina","Vega","Cabrera",
    # Northern / Central European
    "Andersson","Johansson","Nilsson","Bergström","Lindqvist","Eriksson","Hansen","Jensen","Nielsen","Christensen",
    "Schmidt","Müller","Schneider","Fischer","Weber","Meyer","Wagner","Becker","Hoffmann","Schäfer",
    "De Vries","Van Dijk","Bakker","Visser","Jansen","Smit","Mulder","Dekker",
    # Anglo
    "Whitfield","Stone","Carter","Hughes","Reed","Brooks","Bennett","Foster","Coleman","Hayes",
    "Ward","Murphy","Cooper","Sullivan","Russell","Morgan","Mitchell","Edwards","Phillips","Campbell",
    "Bailey","Parker","Hall","Carson","Hudson",
    # Slavic / Baltic
    "Kovac","Novak","Horvat","Kowalski","Wojcik","Lewandowski","Petrov","Volkov","Ivanov","Smirnov",
    "Sokolov","Kuznetsov","Lebedev","Morozov",
    # Mediterranean / Greek
    "Rossi","Russo","Ferrari","Esposito","Bianchi","Romano","Colombo","Ricci","Marino","Greco",
    "Papadopoulos","Karagiannis","Vlachos","Kalogeropoulos",
    # Hebrew / Jewish
    "Cohen","Levi","Friedman","Bergman","Goldberg","Rosenberg",
    # Additional
    "O'Sullivan","Murphy","Walsh","Kelly","Byrne","Ryan","Doyle","Murray",
    "Vasquez","Salazar","Cortez","Delgado","Beltran","Solano",
    "Pillai","Iqbal","Yousef","Ahmadi","Soleimani",
    "Möller","Søderberg","Sjöberg","Lindberg",
]

DEPARTMENTS = [
    ("Engineering",          0.35),
    ("Sales",                0.15),
    ("Operations",           0.08),
    ("Customer Success",     0.08),
    ("Product",              0.08),
    ("Marketing",            0.05),
    ("Design",               0.05),
    ("Finance",              0.05),
    ("IT/Security",          0.05),
    ("People",               0.04),
    ("Legal",                0.02),
]

# Sub-teams keyed by department
TEAMS = {
    "Engineering":      ["Platform","Data","Infrastructure","Web","Mobile","API","ML","Security","SRE","QA"],
    "Sales":            ["Enterprise","Mid-Market","Inside Sales","Partnerships","Sales Ops","SDR"],
    "Operations":       ["Revenue Ops","Business Ops","Procurement","Facilities","Workplace"],
    "Customer Success": ["Onboarding","Renewals","Technical Account","Support","Education"],
    "Product":          ["Core","Platform","Growth","Pricing","Insights"],
    "Marketing":        ["Brand","Demand","Content","Product Marketing","Field"],
    "Design":           ["Product Design","Brand","Research","Systems"],
    "Finance":          ["FP&A","Accounting","Treasury","Procurement"],
    "IT/Security":      ["Endpoint","Infra Security","Compliance","Helpdesk","Identity"],
    "People":           ["Talent","People Ops","L&D","Comp & Benefits"],
    "Legal":            ["Commercial","Privacy","Litigation"],
}

LOCATIONS = [
    # (city, country_iso2, region, comp_adjust)
    ("London",       "GB", "EMEA",   1.05),
    ("Berlin",       "DE", "EMEA",   0.95),
    ("Paris",        "FR", "EMEA",   1.00),
    ("Madrid",       "ES", "EMEA",   0.85),
    ("Amsterdam",    "NL", "EMEA",   1.00),
    ("Dublin",       "IE", "EMEA",   1.00),
    ("New York",     "US", "NA",     1.10),
    ("San Francisco","US", "NA",     1.15),
    ("Austin",       "US", "NA",     1.02),
    ("Toronto",      "CA", "NA",     0.92),
    ("Chicago",      "US", "NA",     0.98),
    ("Atlanta",      "US", "NA",     0.95),
    ("Singapore",    "SG", "APAC",   1.02),
    ("Sydney",       "AU", "APAC",   1.00),
    ("Tokyo",        "JP", "APAC",   1.00),
    ("Bangalore",    "IN", "APAC",   0.50),
    ("São Paulo",    "BR", "LATAM",  0.55),
    ("Mexico City",  "MX", "LATAM",  0.55),
]

# Per department, weight where people sit
DEPT_LOCATION_BIAS = {
    "Engineering":      {"Bangalore":2.0,"London":1.3,"Berlin":1.3,"Amsterdam":1.2,"Austin":1.3,"San Francisco":1.5,"Dublin":1.2,"Singapore":1.0,"Toronto":1.1},
    "Sales":            {"New York":1.8,"London":1.6,"Chicago":1.3,"Atlanta":1.2,"Sydney":1.2,"Paris":1.2,"Madrid":1.1,"São Paulo":1.3,"Mexico City":1.2,"Singapore":1.2},
    "Operations":       {"Dublin":1.4,"Austin":1.2,"Bangalore":1.3,"Manila":0.0},
    "Customer Success": {"Dublin":1.3,"Austin":1.3,"Singapore":1.3,"Toronto":1.2,"Atlanta":1.2},
    "Product":          {"San Francisco":1.6,"London":1.3,"New York":1.3,"Amsterdam":1.1},
    "Marketing":        {"San Francisco":1.4,"London":1.3,"New York":1.5,"Paris":1.1},
    "Design":           {"San Francisco":1.5,"London":1.3,"Amsterdam":1.2,"New York":1.2,"Berlin":1.1},
    "Finance":          {"New York":1.5,"London":1.5,"Dublin":1.2},
    "IT/Security":      {"Austin":1.2,"Dublin":1.2,"Bangalore":1.3,"London":1.2,"San Francisco":1.1},
    "People":           {"London":1.3,"New York":1.2,"Dublin":1.2,"San Francisco":1.1},
    "Legal":            {"New York":1.6,"London":1.5,"Dublin":1.3},
}

# Levels: IC1..IC7, M1..M5
LEVELS = [
    ("IC1", 0.02), ("IC2", 0.12), ("IC3", 0.22), ("IC4", 0.24),
    ("IC5", 0.15), ("IC6", 0.08), ("IC7", 0.03),
    ("M1",  0.05), ("M2",  0.05), ("M3",  0.03), ("M4",  0.01),
]
# M5 is a small overflow added separately

BAND_P50 = {
    "IC1":  60000, "IC2":  85000, "IC3": 115000, "IC4": 150000,
    "IC5": 195000, "IC6": 250000, "IC7": 320000,
    "M1":  165000, "M2":  210000, "M3":  280000, "M4":  360000, "M5": 450000,
}

# Titles by department + level family
TITLES = {
    "Engineering": {
        "IC1": "Junior Software Engineer", "IC2": "Software Engineer I",
        "IC3": "Software Engineer II",     "IC4": "Senior Software Engineer",
        "IC5": "Staff Software Engineer",  "IC6": "Principal Engineer",
        "IC7": "Distinguished Engineer",
        "M1": "Engineering Manager",       "M2": "Senior Engineering Manager",
        "M3": "Director of Engineering",   "M4": "VP, Engineering", "M5": "SVP, Engineering",
    },
    "Sales": {
        "IC1": "Sales Development Rep", "IC2": "Account Executive I",
        "IC3": "Account Executive II",   "IC4": "Senior Account Executive",
        "IC5": "Strategic Account Director", "IC6": "Principal Account Director",
        "IC7": "Distinguished Account Director",
        "M1": "Sales Manager","M2": "Senior Sales Manager",
        "M3": "Director of Sales","M4": "VP, Sales","M5": "SVP, Sales",
    },
    "Product": {
        "IC1": "Associate Product Manager", "IC2": "Product Manager I",
        "IC3": "Product Manager II","IC4": "Senior Product Manager",
        "IC5": "Staff Product Manager","IC6": "Principal Product Manager",
        "IC7": "Distinguished Product Manager",
        "M1": "Group Product Manager","M2": "Senior Group Product Manager",
        "M3": "Director of Product","M4": "VP, Product","M5": "SVP, Product",
    },
    "Design": {
        "IC1": "Associate Designer","IC2": "Product Designer I",
        "IC3": "Product Designer II","IC4": "Senior Product Designer",
        "IC5": "Staff Designer","IC6": "Principal Designer","IC7": "Design Fellow",
        "M1": "Design Manager","M2": "Senior Design Manager",
        "M3": "Director of Design","M4": "VP, Design","M5": "SVP, Design",
    },
    "Customer Success": {
        "IC1": "Associate CSM","IC2": "Customer Success Manager I",
        "IC3": "Customer Success Manager II","IC4": "Senior CSM",
        "IC5": "Strategic CSM","IC6": "Principal CSM","IC7": "Distinguished CSM",
        "M1": "CS Manager","M2": "Senior CS Manager","M3": "Director of CS","M4": "VP, CS","M5": "SVP, CS",
    },
    "Marketing": {
        "IC1": "Marketing Coordinator","IC2": "Marketing Specialist",
        "IC3": "Marketing Manager","IC4": "Senior Marketing Manager",
        "IC5": "Staff Marketing Lead","IC6": "Principal Marketer","IC7": "Distinguished Marketer",
        "M1": "Marketing Manager","M2": "Senior Marketing Manager",
        "M3": "Director of Marketing","M4": "VP, Marketing","M5": "CMO",
    },
    "People": {
        "IC1": "People Coordinator","IC2": "People Operations Specialist",
        "IC3": "People Business Partner","IC4": "Senior People Business Partner",
        "IC5": "Staff HRBP","IC6": "Principal HRBP","IC7": "Fellow, People",
        "M1": "People Manager","M2": "Senior People Manager",
        "M3": "Director, People","M4": "VP, People","M5": "CHRO",
    },
    "Finance": {
        "IC1": "Finance Analyst I","IC2": "Finance Analyst II",
        "IC3": "Senior Finance Analyst","IC4": "Finance Manager",
        "IC5": "Senior Finance Manager","IC6": "Principal Finance","IC7": "Distinguished Finance",
        "M1": "Finance Manager","M2": "Senior Finance Manager",
        "M3": "Director of Finance","M4": "VP, Finance","M5": "CFO",
    },
    "Legal": {
        "IC1": "Legal Analyst","IC2": "Counsel I","IC3": "Counsel II",
        "IC4": "Senior Counsel","IC5": "Lead Counsel","IC6": "Principal Counsel","IC7": "Distinguished Counsel",
        "M1": "Legal Manager","M2": "Senior Legal Manager",
        "M3": "Director of Legal","M4": "VP, Legal","M5": "General Counsel",
    },
    "Operations": {
        "IC1": "Operations Analyst","IC2": "Operations Specialist",
        "IC3": "Operations Manager","IC4": "Senior Operations Manager",
        "IC5": "Staff Operations Lead","IC6": "Principal Operations","IC7": "Distinguished Ops",
        "M1": "Ops Manager","M2": "Senior Ops Manager",
        "M3": "Director of Operations","M4": "VP, Operations","M5": "COO",
    },
    "IT/Security": {
        "IC1": "IT Analyst I","IC2": "IT Engineer","IC3": "Senior IT Engineer",
        "IC4": "Security Engineer","IC5": "Staff Security Engineer",
        "IC6": "Principal Security Engineer","IC7": "Distinguished Security Engineer",
        "M1": "IT Manager","M2": "Senior IT Manager",
        "M3": "Director, IT/Security","M4": "VP, IT/Security","M5": "CISO",
    },
}

EMPLOYMENT_TYPES = [("full_time", 0.93), ("contractor", 0.05), ("part_time", 0.015), ("intern", 0.005)]


def weighted(seq):
    """Weighted random pick. seq is [(item, weight), ...] -> item."""
    total = sum(w for _, w in seq)
    r = random.random() * total
    acc = 0
    for item, w in seq:
        acc += w
        if r <= acc:
            return item
    return seq[-1][0]


def pick_location(dept):
    bias = DEPT_LOCATION_BIAS.get(dept, {})
    weights = []
    for city, iso, region, adj in LOCATIONS:
        w = bias.get(city, 1.0)
        weights.append(((city, iso, region, adj), w))
    return weighted(weights)


def pick_gender():
    # Simulated demographic mix; used for the pay-equity gap.
    # 46% women, 51% men, 3% nonbinary
    r = random.random()
    if r < 0.46: return "woman"
    if r < 0.97: return "man"
    return "nonbinary"


def normal(mean, sd):
    # Box–Muller; clamp to ~±3sd
    u1, u2 = random.random(), random.random()
    z = math.sqrt(-2.0 * math.log(max(u1, 1e-9))) * math.cos(2 * math.pi * u2)
    return mean + z * sd


def hire_date_for_tenure_weighted():
    # Skewed toward 1–3 years tenure
    r = random.random()
    if r < 0.18:
        years = random.uniform(0.0, 1.0)
    elif r < 0.55:
        years = random.uniform(1.0, 3.0)
    elif r < 0.80:
        years = random.uniform(3.0, 5.0)
    else:
        years = random.uniform(5.0, 9.5)
    days = int(years * 365.25)
    return SIM_DATE - timedelta(days=days)


def last_review_for_perf():
    # Distribution of review labels
    r = random.random()
    if r < 0.18: return ("exceeds", round(random.uniform(4.2, 5.0), 1))
    if r < 0.78: return ("meets",   round(random.uniform(3.0, 4.2), 1))
    if r < 0.95: return ("partially_meets", round(random.uniform(2.0, 3.0), 1))
    return ("does_not_meet", round(random.uniform(1.0, 2.0), 1))


def compute_flight_risk(emp):
    """Linear-ish blend of signals, mapped to 0..1.
    Calibrated so ~12% land in 'high' band, ~28% 'moderate', rest 'low'."""
    score = 0.15  # base level — everyone has some chance of leaving
    t = emp["tenure_years"]
    if t < 1.0:
        score += 0.32 * (1.0 - t)
    elif t > 4.5:
        score += 0.18 * min((t - 4.5) / 4.0, 1.0)
    elif 1.0 <= t < 2.0:
        score += 0.08  # the "year two" itch

    cr = emp["comp_ratio"]
    if cr < 0.85:
        score += min((0.85 - cr) * 3.5, 0.45)
    elif cr < 0.95:
        score += (0.95 - cr) * 1.2

    if emp["last_review"] == "exceeds":
        score -= 0.04
    elif emp["last_review"] == "partially_meets":
        score += 0.22
    elif emp["last_review"] == "does_not_meet":
        score += 0.34

    # Promotion eligible but no recent promo
    if emp["promotion_eligible"] and not emp["last_promotion"]:
        score += 0.16

    # Contractors and interns tend to "leave" by definition
    if emp["employment_type"] == "contractor":
        score += 0.10
    elif emp["employment_type"] == "intern":
        score += 0.25

    # Add noise
    score += random.uniform(-0.10, 0.10)

    score = max(0.0, min(1.0, score))
    return round(score, 2)


def band_label(risk):
    if risk >= 0.55: return "high"
    if risk >= 0.35: return "moderate"
    return "low"


def build_people():
    people = []
    # We'll assign IDs as we go and stitch the management tree afterwards.
    for i in range(1, 2001):
        dept = weighted(DEPARTMENTS)
        team = random.choice(TEAMS[dept])
        city, iso, region, loc_adj = pick_location(dept)
        level = weighted(LEVELS)
        is_manager = level.startswith("M")
        gender = pick_gender()

        given = random.choice(GIVEN_NAMES)
        family = random.choice(FAMILY_NAMES)
        display = f"{given} {family}"

        title_table = TITLES.get(dept, TITLES["Engineering"])
        title = title_table.get(level, level)

        hire = hire_date_for_tenure_weighted()
        tenure = round((SIM_DATE - hire).days / 365.25, 1)

        # Base comp = band P50 * location adjust * lognormal noise
        band = BAND_P50[level]
        noise = max(0.55, min(1.4, normal(1.0, 0.12)))
        comp_total = band * loc_adj * noise

        last_review, perf = last_review_for_perf()

        emp_type = weighted(EMPLOYMENT_TYPES)
        if emp_type == "contractor":
            comp_total *= 1.10
        elif emp_type == "part_time":
            comp_total *= 0.60

        # Promotion fields
        promotion_eligible = random.random() < 0.42
        last_promotion = None
        if random.random() < 0.55 and tenure > 1.2:
            yrs_ago = random.uniform(0.3, min(tenure, 3.0))
            last_promotion = (SIM_DATE - timedelta(days=int(yrs_ago * 365.25))).isoformat()

        # Slug email
        email_local = (given + "." + family).lower()
        for ch in [" ", "'", "ç","á","é","í","ó","ú","ñ","ü","ö","ä","å","ø","ć","č","š","ž",
                   "ã","ô","ê","è","ï","î","ô","æ","-"]:
            email_local = email_local.replace(ch, "")
        # also strip remaining non-ascii
        email_local = "".join(c for c in email_local if c.isascii() and (c.isalnum() or c == "."))

        emp = {
            "id": f"EMP-{i:05d}",
            "given_name": given,
            "family_name": family,
            "display_name": display,
            "email": f"{email_local}{i}@tessera.example",
            "title": title,
            "level": level,
            "department": dept,
            "team": team,
            "location": city,
            "country": iso,
            "region": region,
            "manager_id": None,  # filled later
            "hire_date": hire.isoformat(),
            "tenure_years": tenure,
            "comp_total": int(round(comp_total / 500.0) * 500),
            "comp_band_p50": int(round(band * loc_adj)),
            "comp_ratio": 0.0,  # computed below
            "last_review": last_review,
            "performance_score": perf,
            "flight_risk": 0.0,
            "flight_risk_band": "low",
            "is_manager": is_manager,
            "span_of_control": None,  # filled later
            "employment_type": emp_type,
            "promotion_eligible": promotion_eligible,
            "last_promotion": last_promotion,
            "_gender": gender,  # private; not exposed in UI but used for equity stats
        }
        emp["comp_ratio"] = round(emp["comp_total"] / emp["comp_band_p50"], 2)
        people.append(emp)

    # ─── Seed the EMEA pay-equity gap: -4.5% for women @ IC5/IC6/M3
    target_levels = {"IC5", "IC6", "M3"}
    affected = [
        e for e in people
        if e["region"] == "EMEA"
        and e["level"] in target_levels
        and e["_gender"] == "woman"
    ]
    # Apply a -6% perturbation to roughly half (so the *median* gap lands near 4.5%)
    random.shuffle(affected)
    cut = max(1, int(len(affected) * 0.75))
    for e in affected[:cut]:
        # ~6-9% reduction; this drags the median gap to ~4.5%
        factor = random.uniform(0.91, 0.945)
        e["comp_total"] = int(round((e["comp_total"] * factor) / 500.0) * 500)
        e["comp_ratio"] = round(e["comp_total"] / e["comp_band_p50"], 2)

    # ─── Compute flight risk for all
    for e in people:
        e["flight_risk"] = compute_flight_risk(e)
        e["flight_risk_band"] = band_label(e["flight_risk"])

    # ─── Build manager tree
    # Sort by level seniority for tree assembly: M4 -> M3 -> M2 -> M1 -> ICs
    rank = {"IC1":1,"IC2":2,"IC3":3,"IC4":4,"IC5":5,"IC6":6,"IC7":7,
            "M1":5,"M2":7,"M3":9,"M4":10,"M5":11}
    by_id = {e["id"]: e for e in people}

    # 1 top: highest M4 (CXO surrogate per company-wide)
    m4s = [e for e in people if e["level"] == "M4"]
    m3s = [e for e in people if e["level"] == "M3"]
    m2s = [e for e in people if e["level"] == "M2"]
    m1s = [e for e in people if e["level"] == "M1"]
    ics = [e for e in people if e["level"].startswith("IC")]

    # CEO = pick one top-level person, no manager
    if not m4s:
        # promote highest IC7 to a synthetic M4
        candidates = [e for e in people if e["level"] == "IC7"]
        if candidates:
            ceo = candidates[0]
            ceo["level"] = "M4"; ceo["is_manager"] = True; ceo["title"] = "Chief People Officer"
            m4s = [ceo]
    ceo = m4s[0] if m4s else None
    if ceo:
        ceo["manager_id"] = None
        ceo["title"] = "Chief Executive Officer"

    # Other M4s report to CEO
    for m in m4s[1:]:
        m["manager_id"] = ceo["id"] if ceo else None

    # M3 -> M4 (round-robin within department family if possible)
    def pick_manager(candidates, candidate_dept):
        same_dept = [c for c in candidates if c["department"] == candidate_dept]
        pool = same_dept if same_dept else candidates
        return random.choice(pool) if pool else None

    for m in m3s:
        mgr = pick_manager(m4s, m["department"])
        m["manager_id"] = mgr["id"] if mgr else (ceo["id"] if ceo else None)

    # M2 -> M3 (or M4)
    for m in m2s:
        upstream = m3s if m3s else m4s
        mgr = pick_manager(upstream, m["department"])
        m["manager_id"] = mgr["id"] if mgr else (ceo["id"] if ceo else None)

    # M1 -> M2 (or M3)
    for m in m1s:
        upstream = m2s if m2s else (m3s if m3s else m4s)
        mgr = pick_manager(upstream, m["department"])
        m["manager_id"] = mgr["id"] if mgr else (ceo["id"] if ceo else None)

    # ICs -> M1 (or M2 if no M1 in dept)
    # Build pool of managers per department, weighted to spread spans
    mgr_pool_by_dept = {}
    for mgr in (m1s + m2s):
        mgr_pool_by_dept.setdefault(mgr["department"], []).append(mgr)
    span_count = {m["id"]: 0 for m in (m1s + m2s + m3s + m4s)}

    for ic in ics:
        pool = mgr_pool_by_dept.get(ic["department"]) or (m1s + m2s)
        # Prefer managers with lower current span (cap at ~12)
        pool_sorted = sorted(pool, key=lambda m: (span_count[m["id"]], random.random()))
        mgr = pool_sorted[0] if pool_sorted else None
        if mgr:
            ic["manager_id"] = mgr["id"]
            span_count[mgr["id"]] += 1
        else:
            ic["manager_id"] = ceo["id"] if ceo else None
            if ceo: span_count[ceo["id"]] = span_count.get(ceo["id"], 0) + 1

    # Roll up spans for M2 -> count of M1s that report to them, etc.
    for m in (m1s + m2s + m3s + m4s):
        m["span_of_control"] = span_count.get(m["id"], 0)

    # Count direct reports for managers (final)
    direct_reports = {}
    for e in people:
        mid = e["manager_id"]
        if mid:
            direct_reports.setdefault(mid, 0)
            direct_reports[mid] += 1
    for m in (m1s + m2s + m3s + m4s):
        m["span_of_control"] = direct_reports.get(m["id"], 0)

    return people, ceo


def build_orgs(people):
    # Aggregate org metadata
    dept_set = {}
    teams = {}
    locations = {}
    regions = {}

    for e in people:
        dept_set.setdefault(e["department"], 0)
        dept_set[e["department"]] += 1
        key = (e["department"], e["team"])
        teams.setdefault(key, 0); teams[key] += 1
        locations.setdefault(e["location"], 0); locations[e["location"]] += 1
        regions.setdefault(e["region"], 0); regions[e["region"]] += 1

    departments_out = []
    for d, n in sorted(dept_set.items(), key=lambda kv: -kv[1]):
        team_list = sorted(
            [{"name": t, "headcount": teams[(d, t)]} for (dd, t) in teams if dd == d],
            key=lambda x: -x["headcount"],
        )
        departments_out.append({"name": d, "headcount": n, "teams": team_list})

    locations_out = [{"name": c, "headcount": n} for c, n in sorted(locations.items(), key=lambda kv: -kv[1])]
    regions_out = [{"name": r, "headcount": n} for r, n in sorted(regions.items(), key=lambda kv: -kv[1])]
    levels_out = []
    for lvl, _w in LEVELS:
        levels_out.append({"name": lvl, "headcount": sum(1 for e in people if e["level"] == lvl)})

    return {
        "company": {
            "name": "Tessera Bank",
            "headcount": len(people),
            "as_of": SIM_DATE.isoformat(),
        },
        "departments": departments_out,
        "locations": locations_out,
        "regions": regions_out,
        "levels": levels_out,
    }


def strip_private_fields(people):
    """Remove fields starting with _ from output (we keep _gender internally
    but the UI shouldn't display it; however we DO need it for pay-equity
    computation, so we expose it as `gender`)."""
    for e in people:
        e["gender"] = e.pop("_gender")
    return people


def main():
    people, ceo = build_people()
    people = strip_private_fields(people)
    orgs = build_orgs(people)

    out_dir = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(out_dir, "people.json"), "w") as f:
        json.dump(people, f, separators=(",", ":"))
    with open(os.path.join(out_dir, "orgs.json"), "w") as f:
        json.dump(orgs, f, indent=2)

    # Stats for the human running this:
    high_risk = sum(1 for e in people if e["flight_risk_band"] == "high")
    underpaid_hp = sum(1 for e in people if e["performance_score"] >= 4.0 and e["comp_ratio"] < 0.85)
    eng = [e for e in people if e["department"] == "Engineering"]
    eng_med_tenure = sorted(e["tenure_years"] for e in eng)[len(eng)//2] if eng else 0

    # Pay-equity check in EMEA at IC5/IC6/M3
    emea_target = [e for e in people if e["region"] == "EMEA" and e["level"] in {"IC5","IC6","M3"}]
    women = [e for e in emea_target if e["gender"] == "woman"]
    men   = [e for e in emea_target if e["gender"] == "man"]
    def med(xs): xs = sorted(xs); return xs[len(xs)//2] if xs else 0
    med_w = med([e["comp_total"] for e in women])
    med_m = med([e["comp_total"] for e in men])
    gap = (med_m - med_w) / med_m * 100 if med_m else 0

    print(f"  people.json  : {len(people)} employees")
    print(f"  orgs.json    : {len(orgs['departments'])} departments")
    print(f"  high flight-risk cohort: {high_risk} ({100*high_risk/len(people):.1f}%)")
    print(f"  underpaid high performers: {underpaid_hp}")
    print(f"  engineering median tenure: {eng_med_tenure} yrs")
    print(f"  EMEA IC5/IC6/M3 women n={len(women)}, men n={len(men)}, median gap={gap:.2f}%")

if __name__ == "__main__":
    main()
