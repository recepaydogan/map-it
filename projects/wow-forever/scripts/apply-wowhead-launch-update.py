"""Apply reviewed launch notes to English catalogs; never write foreign locale packs.

Behavior comes from Wowhead's official launch notes. Supporting client captures
provide spell IDs, icons and exact rank values where the notes use percentages.
New negative calculator IDs are app-owned identities, never Blizzard trait IDs.
"""
import copy
import json
from pathlib import Path
import re
import shutil

ROOT = Path(__file__).resolve().parents[1]
AUDIT = ROOT / "data/site-research/wowhead-check-2026-11-04"
SNAPSHOT = "wowhead-2026-11-04"
changed = []
def read(path): return json.loads((ROOT / path).read_text(encoding="utf-8-sig"))
def baseline(path):
    saved = AUDIT / "before" / path
    return json.loads(saved.read_text(encoding="utf-8-sig")) if saved.exists() else read(path)
def write(path, value):
    target = ROOT / path
    if read(path) == value: return
    backup = AUDIT / "before" / path
    if not backup.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(target, backup)
    target.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf8")
    changed.append(str(path))

support = read(AUDIT / "supporting/spells.json")
shards = [baseline(f"public/data/spells/foreverdb/{i}.json") for i in range(64)]
spells = {sid: value for shard in shards for sid, value in shard.items()}
before_spells = copy.deepcopy(spells)
catalog = baseline("public/data/classes/talent-calculator.json")
before_catalog = copy.deepcopy(catalog)
classes = baseline("public/data/spells/foreverdb/classes.json")
class_ids = {"Warrior":1,"Paladin":2,"Hunter":3,"Rogue":4,"Priest":5,"Shaman":7,"Mage":8,"Warlock":9,"Druid":11}

def numeric(text, label):
    match = re.fullmatch(re.escape(label) + r" (-?[\d,.]+)", text)
    return float(match[1].replace(",", "")) if match else None
def source_description(value):
    # Conditional talent additions are not part of an unmodified base spell.
    value = re.sub(r"\[[^\[\]]*\]", "", value)
    return re.sub(r"\s+", " ", value).strip()
def ensure_spell(sid, cls):
    key = str(sid)
    if key not in spells:
        value = support[key]
        assert value["status"] == 200
        spells[key] = {"id":sid,"n":value["name"],"r":"","ic":int(value["references"]["Icon ID"]),"cl":cls,"ct":0,"new":True}
        shards[sid % 64][key] = spells[key]
    return spells[key]

# Reconcile the captured canonical ability ranks. Never use same-named NPC spells.
metadata_ids = {r["id"] for cls in classes for a in cls["abilities"] if a.get("src") != "sod" for r in a["ranks"]}
metadata_ids.update(int(sid) for sid, value in support.items() if value.get("approvedCanonicalRank"))
explicit = {1329283:4,1329549:4,1329555:1,1329554:1,1329328:4,1329286:4,1329284:4,1329265:4,1329256:4,1328825:4,1328829:11,1328618:11,1316709:4,16120:7,16166:7,1310315:1,1310728:4}
updated_ability_ids = set()
for sid, value in support.items():
    iid = int(sid)
    if value["status"] != 200 or (iid not in metadata_ids and iid not in explicit): continue
    record = ensure_spell(iid, explicit.get(iid, spells.get(sid, {}).get("cl", 0)))
    previous = copy.deepcopy(record)
    record["n"] = value["name"]
    if iid in explicit: record["cl"] = explicit[iid]
    record["ic"] = int(value["references"]["Icon ID"])
    description = source_description(value["description"])
    if description: record["d"] = description
    head = value["tooltip"].split(value["description"])[0] if value["description"] else value["tooltip"]
    level = re.search(r"Requires Level (\d+)", head)
    if level: record["lv"] = int(level[1])
    cooldown = re.search(r"(\d+(?:\.\d+)?) (sec|min) cooldown", head)
    if cooldown: record["cd"] = round(float(cooldown[1]) * (1000 if cooldown[2] == "sec" else 60000))
    cast = re.search(r"(\d+(?:\.\d+)?) sec cast", head)
    if cast: record["ct"] = round(float(cast[1]) * 1000)
    elif "Instant" in head: record["ct"] = 0
    cost = re.search(r"(\d+) (Mana|Rage|Energy|Focus)\b", head)
    if cost: record["co"] = [[int(cost[1]),cost[2],0]]
    rg = re.search(r"(\d+) yd range", head)
    if rg: record["rg"] = [0,int(rg[1])]
    replacements = {}
    effects = record.get("ef", [])
    if len(effects) == len(value["effects"]):
        for effect, actual in zip(effects, value["effects"]):
            pills = actual["pills"]
            numbers = {label: next((n for p in pills if (n := numeric(p,label)) is not None),None) for label in ["Value","SP Coefficient","AP Coefficient","Variance"]}
            old_v = effect.get("v")
            if numbers["Value"] is not None:
                effect["v"] = numbers["Value"]
                if old_v is not None and old_v != effect["v"]: replacements[old_v] = effect["v"]
            else: effect.pop("v",None)
            for key,label in [("sp","SP Coefficient"),("ap","AP Coefficient")]:
                if numbers[label] is not None and (effect.get(key) is None or abs(effect[key]-numbers[label]) >= 0.01): effect[key] = numbers[label]
            if actual["name"] == "Dummy" and effect.get("e") == 10:
                # Riptide no longer has an initial heal. A stale Heal effect must not survive.
                effect.clear();effect.update(e=3,tg=21)
                continue
            if old_v != effect.get("v"):
                effect.pop("pl",None)  # No stale per-level coefficient when the new capture does not expose it.
                effect.pop("lo",None);effect.pop("hi",None)
                variance = numbers["Variance"]
                if variance and effect.get("v") is not None:
                    effect["lo"] = round(effect["v"]*(1-variance/2),3)
                    effect["hi"] = round(effect["v"]*(1+variance/2),3)
            # For ranged school damage, display base rank values, not a provider's preview level.
            if actual["name"] == "School Damage" and numbers["Variance"] and "d" in record:
                low, high = effect.get("lo"),effect.get("hi")
                if low is not None and high is not None:
                    damage = rf"{round(low)} to {round(high)}"
                    record["d"] = re.sub(r"(?:\d+(?:\.\d+)?(?: to \d+(?:\.\d+)?)?) (?=(?:Arcane|Nature|Fire|Frost) damage)",damage+" ",record["d"],count=1)
    if "a" in record:
        record["a"] = re.sub(r"(?<![\w.])-?\d+(?:\.\d+)?",lambda m: f"{replacements.get(float(m[0]),float(m[0])):g}",record["a"])
    if previous != record: updated_ability_ids.add(iid)

def tree(cls, name): return next(t for c in catalog["classes"] if c["n"] == cls for t in c["trees"] if t["n"] == name)
def talent(cls, tr, name): return next(t for t in tree(cls,tr)["talents"] if t["n"] == name)
def change(cls,tr,name,descriptions=None,**fields):
    value = talent(cls,tr,name)
    if descriptions is not None:
        value["d"] = descriptions
        value["ranks"] = [fields.pop("spell",value["ranks"][0])] * len(descriptions)
    value.update(fields)
    return value
def replace(cls,tr,old,new,descriptions,spell=None,**fields):
    actual = old if any(t["n"] == old for t in tree(cls,tr)["talents"]) else new
    value = change(cls,tr,actual,descriptions,**({"spell":spell} if spell else {}),**fields)
    value["n"] = new
    for key in ["header","requires"]: value.pop(key,None)
    return value
def add(cls,tr,name,sid,row,col,descriptions,passive=True):
    target = tree(cls,tr)
    value = next((t for t in target["talents"] if t["n"] == name),None)
    if not value:
        value = {"id":-sid,"n":name,"row":row,"col":col,"ic":spells[str(sid)]["ic"],"ranks":[sid]*len(descriptions),"d":descriptions,"pre":[],"passive":passive}
        target["talents"].append(value)
    return value
def remove(cls,tr,names): tree(cls,tr)["talents"] = [t for t in tree(cls,tr)["talents"] if t["n"] not in names]

# Warrior: rank limits, positions and all explicitly announced dependency changes.
change("Warrior","Arms","Improved Tactical Mastery",[f"Tactical Mastery lets you retain up to an additional {n} Rage when you change stances." for n in [5,10,15]])
change("Warrior","Arms","Anger Management",pre=[[talent("Warrior","Arms","Improved Tactical Mastery")["id"],2]])
change("Warrior","Arms","Bloodthrill",[f"Grants your Main Hand melee attacks against enemies afflicted by your Rend a {n}% chance to allow an activation of Overpower." for n in [10,20]])
change("Warrior","Arms","Two-Handed Weapon Specialization",[f"Increases the damage you deal with two-handed melee weapons by {n}%." for n in [2,4,6]])
change("Warrior","Arms","Improved Slam",[f"Reduces the cooldown of your Slam ability by {cd} sec, the cast time and global cooldown by {ct} sec, and Slam no longer interrupts or delays your melee swing." for cd,ct in [(2.5,0.25),(5,0.5)]])
change("Warrior","Arms","Spearing Strike",["A brutal attack that deals 75% weapon damage. Deals an additional 75% weapon damage against Giants, Dragonkin, and mounted targets. Mounted targets are dismounted."])
for t in tree("Warrior","Fury")["talents"]:
    if t["n"] == "Booming Voice":
        t["d"] = [d.replace("Shouts", "Shouts and Piercing Howl") if "Piercing Howl" not in d else d for d in t["d"]]
change("Warrior","Fury","Enrage",row=2,col=3)
change("Warrior","Fury","Gore Drinker",row=4,col=2,pre=[[talent("Warrior","Fury","Blood Craze")["id"],2]])
change("Warrior","Fury","Flurry",[f"Increases your melee attack speed by {n}% for your next 3 swings after dealing a melee critical strike." for n in [10,20,30]],row=5,col=2,pre=[])
replace("Warrior","Fury","Raging Blows","Improved Whirlwind",[f"Reduces the cooldown of your Whirlwind ability by {n} sec and increases the damage it deals to the closest enemy by {n*15}%." for n in [1,2]],row=5,col=0,passive=True)
change("Warrior","Fury","Bloodthirst",pre=[[talent("Warrior","Fury","Death Wish")["id"],0]])
add("Warrior","Fury","Reckless Swings",1329555,3,1,[support["1329555"]["description"]],False)
change("Warrior","Protection","Defiance",[f"Increases all threat generated in Defensive stance by an additional {n}% while a shield is equipped." for n in [7,13,20]])

# Rogue: preserve semantic identities for saved/recommended allocations; namespace new nodes.
remove("Rogue","Assassination",{"Murder"})
change("Rogue","Assassination","Improved Expose Armor",row=1,col=1)
change("Rogue","Assassination","Vigor",row=2,col=0)
add("Rogue","Assassination","Blood Splatter",1329256,2,1,[support["1329256"]["description"]])
change("Rogue","Assassination","Lethality",[re.sub(r"by \d+%",f"by {n}%",talent("Rogue","Assassination","Lethality")["d"][-1]) for n in [10,20]])
change("Rogue","Assassination","Relentless Strikes",[f"Your finishing moves have a {n}% chance per Combo Point to restore 25 Energy." for n in [4,8,12,16,20]],row=4,col=0)
change("Rogue","Assassination","Venom",[support["1329328"]["description"]],spell=1329328,row=4,col=1,pre=[],passive=True)
change("Rogue","Assassination","Seal Fate",[f"Your critical strikes from abilities that add Combo Points have a {n}% chance to add an additional Combo Point." for n in [33,66,100]])
change("Rogue","Assassination","Mutilate",["Instantly attacks with both weapons for 90% weapon damage plus an additional 39.6 with each weapon. Damage increased by 20% against Poisoned targets. Awards 2 Combo Points."],row=6,col=1,pre=[[talent("Rogue","Assassination","Venom")["id"],0]])
replace("Rogue","Combat","Improved Eviscerate","Coup de Grace",[f"Increases the damage done by your Eviscerate ability by {n}%, and the damage and storage rate of your Death Mark ability by {n}%." for n in [7,13,20]])
replace("Rogue","Combat","Improved Sinister Strike","Efficient Strikes",[f"Reduces the Energy cost of your Sinister Strike and Hemorrhage abilities by {n}." for n in [3,5]])
change("Rogue","Combat","Improved Sprint",row=1,col=3)
add("Rogue","Combat","Composure",1329265,2,3,[f"Increases the Energy cost reduction of your Poised ability by {n}." for n in [5,10]])
change("Rogue","Combat","Flawless Execution",["Reduces the Energy cost of your Eviscerate ability by 15."])
change("Rogue","Combat","Weapon Expertise",row=3,col=2,pre=[[talent("Rogue","Combat","Precision")["id"],2]])
change("Rogue","Combat","Aggression",[f"Increases the damage of your Sinister Strike and Eviscerate abilities by {n}%." for n in [5,10,15]],row=3,col=3)
change("Rogue","Combat","Dual Wield Specialization",[f"Increases the damage done by your off-hand weapon by {n}%." for n in [25,50]],row=4,col=0,pre=[])
add("Rogue","Combat","Flash of Steel",1329284,5,2,[f"Increases the Energy generated by your Shank ability by {n*3} and reduces its cooldown by {n*0.4:g} sec." for n in range(1,6)])
change("Rogue","Combat","Adrenaline Rush",pre=[[talent("Rogue","Combat","Blade Flurry")["id"],0]])
change("Rogue","Subtlety","Setup",[f"Gives you a {n}% chance to add a Combo Point to your target after Dodging their attack or fully resisting one of their spells." for n in [15,30,45]],row=0,col=0)
change("Rogue","Subtlety","Opportunity",[f"Increases the damage dealt by your Backstab, Garrote, Ambush, and Mutilate abilities by {n}%." for n in [4,8,12,16,20]])
change("Rogue","Subtlety","Dirty Deeds",row=1,col=0)
change("Rogue","Subtlety","Camouflage",[f"Increases your movement speed while stealthed by {n*5}% and reduces the cooldown of your Stealth ability by {n*2} sec." for n in [1,2,3]],row=1,col=1)
change("Rogue","Subtlety","Improved Ambush",row=1,col=2)
change("Rogue","Subtlety","Dirty Tricks",row=1,col=3)
change("Rogue","Subtlety","Premeditation",row=2,col=1)
change("Rogue","Subtlety","Serrated Blades",row=2,col=2)
change("Rogue","Subtlety","Elusiveness",row=3,col=0)
change("Rogue","Subtlety","Ghostly Strike",["A strike that deals 125% (180% if a Dagger is equipped in your Main Hand) weapon damage, increases your chance to dodge by 15% for 7 sec, and causes your next Ambush or Garrote cast within 7 sec to not require Stealth. Awards 1 combo point."],row=3,col=1)
replace("Rogue","Subtlety","Quietus","Quick Getaway",[f"Increases the maximum number of targets you may have Sapped by 1, and increases your movement speed by {n}% for 3 sec after Sapping a target." for n in [15,30]],row=3,col=3,pre=[[talent("Rogue","Subtlety","Dirty Tricks")["id"],1]],ic=spells["1310728"]["ic"])
change("Rogue","Subtlety","Heightened Senses",row=4,col=0)
change("Rogue","Subtlety","Hemorrhage",["An instant strike that deals 100% weapon damage (145% if a Dagger is equipped) and causes the target to take 15% increased Rupture and Garrote damage from the Rogue. Lasts 15 sec. Awards 1 Combo Point."])
replace("Rogue","Subtlety","Cutthroat","Boot Knife",[f"Grants your Shank ability a {n}% chance to add 2 Combo Points to the target." for n in [20,40,60,80,100]],spell=1329286,ic=spells["1329286"]["ic"])
replace("Rogue","Subtlety","Thousand Cuts","Death Mark",["Finishing move that marks the target, storing a portion of the damage dealt by your attacks per Combo Point. Garrote and Rupture damage is stored at twice the rate. After 6 sec, the stored damage is dealt, up to a maximum increased by Attack Power and Critical Strike chance."],spell=1316709,ic=spells["1316709"]["ic"],passive=False)
remove("Rogue","Subtlety",{"Improved Distract"})

# Shaman, Hunter, Druid, Mage and Paladin tuning stated explicitly in the notes.
replace("Shaman","Elemental","Lava Burst","Call of Thunder",[support["16120"]["description"]],spell=16120,ic=spells["16120"]["ic"],passive=True)
replace("Shaman","Elemental","Elemental Mastery","Lightning Mastery",[support["16166"]["description"]],ic=spells["16166"]["ic"])
for t in tree("Shaman","Elemental")["talents"]:
    t["d"] = [d.replace(", and Lava Burst", "").replace(" and Lava Burst", "").replace(", Lava Burst", "").replace("Lava Burst, ", "").replace(", Chain Lightning spells", " and Chain Lightning spells").replace(", Fire Nova spells", " and Fire Nova spells") for d in t["d"]]
change("Shaman","Elemental","Elemental Reach",[f"Increases the range of your Lightning Bolt, Chain Lightning, and Fire Nova spells by {n} yards." for n in [3,6]])
change("Shaman","Elemental","Lightning Overload",[re.sub(r"a \d+% chance",f"a {n}% chance",talent("Shaman","Elemental","Lightning Overload")["d"][0]) for n in [10,20,30]])
change("Shaman","Enhancement","Improved Ghost Wolf",row=3,col=3)
change("Shaman","Enhancement","Improved Lightning Shield",col=2)
change("Shaman","Enhancement","Mental Dexterity",[f"Increases your Attack Power by an amount equal to {n}% of your Intellect." for n in [50,100,150]])
change("Shaman","Enhancement","Flurry",[f"Increases your attack speed by {n}% for your next 3 swings after dealing a melee critical strike." for n in [6,12,18,24,30]])
change("Shaman","Enhancement","Stormstrike",["Instantly strike for 150% normalized weapon damage and increase the damage you deal to the target with your next Lightning Bolt, Chain Lightning, or Earth Shock spell by 20% for 12 sec."])
change("Shaman","Restoration","Riptide",[spells["408521"]["d"]])
change("Hunter","Marksmanship","Barrage",[f"Increases the damage done by your Multi-Shot, Aimed Shot, and Volley abilities by {n}%." for n in [5,10,15]])
change("Hunter","Survival","Lightning Reflexes",[f"Increases your Agility by {n}%." for n in [3,6,9,12,15]])
change("Hunter","Marksmanship","Trueshot Aura",["Increases the Ranged Attack Power of party or raid members within 45 yds by 20."])
feral = next(t["n"] for c in catalog["classes"] if c["n"]=="Druid" for t in c["trees"] if any(v["n"]=="Rend and Tear" for v in t["talents"]))
change("Druid",feral,"Rend and Tear",[f"Increases the damage done by your melee abilities on Bleeding targets by {n}%." for n in [3,6,9,12,15]])
change("Paladin","Retribution","Vengeance",[d.replace("Stacks up to 3 times","Stacks up to 5 times") for d in talent("Paladin","Retribution","Vengeance")["d"]])
change("Warlock","Destruction","Shadow and Flame",[re.sub(r"by \d+%",f"by {n}%",d) for n,d in zip([4,8,12,16,20],talent("Warlock","Destruction","Shadow and Flame")["d"])])
for tr in next(c for c in catalog["classes"] if c["n"]=="Mage")["trees"]:
    for t in tr["talents"]: t["d"] = [d.replace("Frostbolt, Frost Blast,", "Frostbolt,").replace("Frostbolt and Frost Blast spells", "Frostbolt spell") for d in t["d"]]

changed_talents = []
before_by_id = {t["id"]: t for c in before_catalog["classes"] for tr in c["trees"] for t in tr["talents"]}
for cls in catalog["classes"]:
    for tr in cls["trees"]:
        tr["talents"].sort(key=lambda t:(t["row"],t["col"],t["id"]))
        for t in tr["talents"]:
            if before_by_id.get(t["id"]) == t: continue
            changed_talents.append(t["id"])
            sid = t["ranks"][0]
            record = ensure_spell(sid,class_ids[cls["n"]])
            record.update(n=t["n"],cl=class_ids[cls["n"]],d=t["d"][0],rk=t["d"],pa=t.get("passive",True),ic=t["ic"])
            record.pop("unavailableInSnapshot",None)
            record.pop("retired",None)
            # Reworked effects must not retain unrelated legacy mechanics.
            for field in ["a","rq"]: record.pop(field,None)
            if t["n"] not in ["Stormstrike","Riptide","Trueshot Aura"]: record.pop("ef",None)

# Exact active fields and raw values that are explicitly known from the source.
spells["71"]["d"] = spells["71"]["d"].replace("threat generated by 30%","threat generated by 80%")
for sid in [71,1612]:
    for effect in spells[str(sid)].get("ef",[]):
        if effect.get("a")==10: effect["v"]=80
spells["12792"]["ef"]=[{"e":6,"a":10,"v":7,"tg":1}]
for effect in spells["21178"]["ef"]:
    if effect.get("a")==10: effect["v"]=115
for sid,record in spells.items():
    if record.get("cl")==11 and record["n"] in ["Bear Form","Dire Bear Form"]:
        for field in ["d","a"]:
            if field in record: record[field]=record[field].replace("threat generated by 50%","threat generated by 115%")
    if record.get("cl")==1 and record["n"]=="Slam": record["cd"]=15000
    if record.get("cl")==7 and record["n"]=="Stormstrike": record["cd"]=6000
    if record.get("cl")==7 and record["n"]=="Riptide": record["cd"]=12000
    if record.get("cl")==7 and record["n"]=="Chain Lightning": record["ct"]=2500
    if record.get("cl")==7 and record["n"]=="Chain Lightning" and int(sid) in metadata_ids:
        for effect in record.get("ef",[]):
            if effect.get("e")==2:effect["sp"]=0.714
    if record.get("cl")==3 and record["n"]=="Arcane Shot" and int(sid) in metadata_ids:
        for effect in record.get("ef",[]):
            if effect.get("e")==2:effect["ap"]=0.15
    if record.get("cl")==3 and record["n"]=="Serpent Sting" and int(sid) in metadata_ids:
        for effect in record.get("ef",[]):
            if effect.get("a")==3:effect["ap"]=0.05
    if record.get("cl")==2 and record["n"]=="Vengeance":
        for field in ["d","a"]:
            if field in record:record[field]=record[field].replace("Stacks up to 3 times","Stacks up to 5 times")
wrack = spells["1316697"]
wrack["d"] = "Tears the target apart from within, inflicting 36 Shadow damage every 1 sec, increasing by 2.5 per level up to 86 at level 60, and increasing the damage taken from your other Shadow damage over time effects by 10% for 6 sec."
wrack["a"] = "Inflicts Shadow damage every 1 sec and increases damage taken from the caster's other Shadow damage over time effects by 10%."
for effect in wrack["ef"]:
    if effect.get("a")==3:effect.update(sp=0.286,pl=2.5)
for sid in [1329283,1329549]:
    s=spells[str(sid)];energy=15 if sid==1329283 else 25
    s.update(d=f"Instantly strike with your off-hand weapon, dealing 50% weapon damage and generating {energy} Energy. Shank cannot Miss.",r="Rank 1" if sid==1329283 else "Rank 2",cd=10000,rg=[0,5],co=[[5,"Energy",0]],sc="Physical",ef=[{"e":31,"v":50,"tg":6},{"e":30,"v":energy,"tg":1}],lv=24 if sid==1329283 else 44)
spells["1329555"].update(sc="Physical",co=[[25,"Health",1]],cd=15000,du=8000,rg=[0,0],ct=0,pa=False,ef=[{"e":6,"a":42,"tr":1329554,"tg":1}])
spells["1329554"].update(sc="Physical",ef=[{"e":30,"v":5,"tg":1}])
for sid,cls,level in [(1328825,4,18),(1328829,11,32)]:
    spells[str(sid)].update(cl=cls,lv=level,sc="Physical",pa=True,ef=[{"e":6,"a":4,"v":10,"tg":1}])
for sid in [1316709,1325756,1325757,1325758]:
    s=spells[str(sid)];s.update(cl=4,rg=[0,20],cd=10000)
    if "Garrote and Rupture damage is stored at twice the rate." not in s["d"]:
        s["d"]=s["d"].replace("After 6 sec", "Garrote and Rupture damage is stored at twice the rate. After 6 sec")
spells["1328618"].update(r="Rank 1",lv=24,cl=11)
for sid,record in spells.items():
    if record.get("cl")==11 and record["n"]=="Ferocious Bite" and int(sid)!=1328618 and str(sid) in support:
        old_rank=int(re.search(r"\d+",before_spells.get(sid,{}).get("r","1"))[0]);record["r"]=f"Rank {old_rank+1}"

# Keep historical IDs readable without presenting removed abilities as playable.
retired = set()
for sid,record in spells.items():
    if (record.get("cl"),record["n"]) in {(7,"Lava Burst"),(8,"Frost Blast"),(5,"Binding Heal"),(4,"Murder"),(4,"Cutthroat")} or sid=="1310703":
        record["retired"]=True;record["cl"]=0;retired.add(int(sid))

for cls in classes:
    current=next(c for c in catalog["classes"] if c["n"]==cls["n"])
    for tr in cls["trees"]:
        actual=next(t for t in current["trees"] if t["n"]==tr["n"])
        old={t["id"]:t for t in tr["talents"]}
        tr["talents"]=[{**{k:v for k,v in old.get(t["id"],{}).items() if k not in ["e","df","gate","header","requires"]},**t,"sp":t["ranks"][0],"lv":10+5*t["row"],"max":len(t["ranks"]),"gate":[5*t["row"],0]} for t in actual["talents"]]
    for a in cls["abilities"]:
        a["ranks"]=[r for r in a["ranks"] if r["id"] not in retired]
        for rank in a["ranks"]:
            s=spells.get(str(rank["id"]))
            if s and rank["id"] in updated_ability_ids:rank.update(r=s["r"],ic=s["ic"],lv=s.get("lv",rank.get("lv",1)))
        if a["ranks"] and a["ranks"][0]["id"] in updated_ability_ids:a["n"]=spells[str(a["ranks"][0]["id"])]["n"]
    cls["abilities"]=[a for a in cls["abilities"] if a["ranks"]]
    additions = [([1329283,1329549],"Combat",False),([1328825],"Combat",True)] if cls["n"]=="Rogue" else [([1328829],"Feral Combat",True)] if cls["n"]=="Druid" else []
    for ids,line,passive in additions:
        n=spells[str(ids[0])]["n"]
        if not any(a["n"]==n for a in cls["abilities"]):
            cls["abilities"].append({"n":n,"sl":line,"new":True,"lv":spells[str(ids[0])]["lv"],"src":"trainer","ranks":[{"id":sid,"r":spells[str(sid)]["r"],"lv":spells[str(sid)]["lv"],"ic":spells[str(sid)]["ic"]} for sid in ids]})
    if cls["n"]=="Druid":
        a=next(a for a in cls["abilities"] if a["n"]=="Ferocious Bite")
        if not any(r["id"]==1328618 for r in a["ranks"]):a["ranks"].insert(0,{"id":1328618,"r":"Rank 1","lv":24,"ic":spells["1328618"]["ic"]})
        a["lv"]=24
    for name in (["Mutilate","Death Mark"] if cls["n"]=="Rogue" else ["Riptide"] if cls["n"]=="Shaman" else []):
        ids=sorted((int(sid) for sid,s in spells.items() if s["n"]==name and s.get("cl")==cls["id"] and re.fullmatch(r"Rank \d+",s.get("r",""))),key=lambda sid:spells[str(sid)].get("lv",1))
        if not ids:continue
        existing=next((a for a in cls["abilities"] if a["n"]==name),None)
        if existing is None:
            existing={"n":name,"sl":"Assassination" if name=="Mutilate" else "Subtlety" if name=="Death Mark" else "Restoration","src":"talent","new":True}
            cls["abilities"].append(existing)
        existing.update(lv=spells[str(ids[0])].get("lv",40),ranks=[{"id":sid,"r":spells[str(sid)]["r"],"lv":spells[str(sid)].get("lv",40),"ic":spells[str(sid)]["ic"]} for sid in ids])

catalog["sourceSnapshot"]=SNAPSHOT
write("public/data/classes/talent-calculator.json",catalog)
write("public/data/spells/foreverdb/classes.json",classes)
index = baseline("public/data/spells/foreverdb/index.json")
existing = {r[0] for r in index}
for sid in explicit:
    if sid not in existing:
        s=spells[str(sid)];index.append([sid,s["n"],s["r"],s["ic"],s.get("cl",0),1,0])
for row in index:
    s=spells[str(row[0])]
    if before_spells.get(str(row[0])) != s:
        row[1],row[2],row[3],row[4]=s["n"],s["r"],s["ic"],s.get("cl",0)
for i,shard in enumerate(shards):write(f"public/data/spells/foreverdb/{i}.json",shard)
write("public/data/spells/foreverdb/index.json",sorted(index,key=lambda r:r[0]))
manifest=read("public/data/spells/foreverdb/manifest.json");manifest["count"]=len(index);write("public/data/spells/foreverdb/manifest.json",manifest)

main=baseline("public/data/classes/catalog.json")
for cls in main["classes"]:
    metadata=next(c for c in classes if c["n"]==cls["name"])
    cls["abilities"]["new"]=[a for a in cls["abilities"]["new"] if a["name"] not in {"Venom"} or cls["id"]!="rogue"]
    for a in metadata["abilities"]:
        if a["n"] not in {"Shank","Poised"}:continue
        s=spells[str(a["ranks"][0]["id"])]
        if not any(v["name"]==a["n"] for v in cls["abilities"]["new"]):cls["abilities"]["new"].append({"name":a["n"],"level":a["lv"],"passive":bool(s.get("pa")),"specialization":a.get("sl",""),"description":s["d"],"icon":f"data/spells/icons/{s['ic']}.webp"})
    cls["trainedAbilities"]=[a for a in cls["trainedAbilities"] if not (cls["id"],a["name"]) in {("mage","Frost Blast"),("shaman","Lava Burst"),("priest","Binding Heal")}]
    cls["abilities"]["reworked"]=["Call of Thunder" if n=="Lava Burst" and cls["id"]=="shaman" else n for n in cls["abilities"]["reworked"]]
write("public/data/classes/catalog.json",main)

for cls in classes:
    path=f"public/data/spells/writeups/{cls['n'].lower()}.json"
    data=read(path)
    for a in cls["abilities"]:
        for r in a["ranks"]:
            sid=r["id"]
            if sid in updated_ability_ids or sid in explicit:
                s=spells[str(sid)]
                if s.get("d"):data["abilities"][str(sid)]={"summary":s["d"],"details":[s["d"]]}
    for sid in retired:data["abilities"].pop(str(sid),None)
    write(path,data)

(AUDIT / "applied-update.json").write_text(json.dumps({"sourceSnapshot":SNAPSHOT,"primarySource":"https://www.wowhead.com/forever/news/wow-forever-official-development-notes-and-class-tuning-383704","changedPaths":changed,"changedTalentIds":changed_talents,"addedTalentIds":[t["id"] for c in catalog["classes"] for tr in c["trees"] for t in tr["talents"] if t["id"] not in before_by_id],"removedTalentIds":sorted(set(before_by_id)-{t["id"] for c in catalog["classes"] for tr in c["trees"] for t in tr["talents"]}),"newSpellIds":sorted(set(map(int,spells))-set(map(int,before_spells))),"retiredPlayableSpellIds":sorted(retired),"abilityRanksUpdated":len(updated_ability_ids),"limits":["Exact spell IDs/icons and rank values are cross-checked against supporting client captures where the live Wowhead endpoint is blocked.","Negative calculator talent IDs are app-owned, not purported native IDs.","No item/marker additions inferred from unverified hidden-item counts."]},indent=2),encoding="utf8")
print(json.dumps({"changedPaths":len(changed),"changedTalents":len(changed_talents),"updatedAbilityRanks":len(updated_ability_ids),"retiredPlayableSpells":len(retired)}))
