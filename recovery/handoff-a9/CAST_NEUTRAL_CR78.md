# CAST_NEUTRAL_CR78.md
**App:** The Mind Files Studio, built against v4.7.0. Bundle with CR-77.
**Goal:** a cast that reads as international. No Indian-specific names, city or cultural markers, because the channel targets a global English-speaking audience.
**Bank:** `psychology-shorts-topic-bank-v2.md` v2.3 already uses the new names and has a **Cast** section (identity blocks).

---

## 1. What is hard-coded in v4.7.0 today

Found in the app bundle:

| Current | Where it shows up |
|---|---|
| `meera_v1`, `arjun_v1` | Cast IDs |
| "the protagonist, 29, from Mumbai, works at a marketing agency" | Protagonist descriptor |
| "Meera's best friend, 28" / "Meera's ex, 32 (flashbacks…)" / "Meera's colleague" / "Meera's manager, 50" / "Meera's mother, 55" / "Meera's mum" | Supporting-cast roles |

---

## 2. Changes

### A. Rename the long-form cast

| Old | New | Notes |
|---|---|---|
| `meera_v1` / Meera | `maya_v1` / **Maya** | Friend who notices patterns |
| `arjun_v1` / Arjun | `alex_v1` / **Alex** | Protagonist |
| Dev (LF-03) | **Leo** | Roommate in LF-03 |

- **Identity blocks:** take them word for word from the bank's Cast section. These are what the app appends to visual prompts (CR-77).
- **Supporting roles:** keep them but make them neutral: "Maya's best friend, 28", "Maya's ex, 32 (flashbacks, slightly desaturated)", "Maya's colleague", "Maya's manager, 50", "Maya's mom, 55".
- **Protagonist descriptor:** "the protagonist, 28, works at a marketing agency". **Remove "from Mumbai".**

### B. Neutral defaults everywhere
1. **No city, country, nationality, religion or ethnicity** in any cast descriptor, archetype or generated vignette. This applies to Shorts archetypes too.
2. **Neutral name pool** for supporting roles and Shorts: Sam, Nora, Ben, Lena, Theo, Mia, Ryan, Zoe, Max, Ella, Jonah, Ivy.
3. **Vignette prompt rule (CR-61 generator):** "Use the names given. Do not add a city, country, festival, food or landmark tied to one culture. Use 'apartment', not 'flat'. Use dollars for money."
4. **Lint (amber):** flag any vignette, seed or shot prompt containing a city or country name, or one of these terms:
   - rupee, lakh, crore
   - Diwali, Holi, chai, auto-rickshaw
   - Mumbai, Delhi, Bangalore
   - flat
   - The word list lives in settings so it can be extended.
5. **Do not change the scheduling timezone (Asia/Kolkata).** That's your posting clock, not on-screen content.

### C. Migration
- Projects already rendered keep their old cast. Nothing is re-rendered automatically.
- Re-importing bank v2.3 updates LF seeds in place (CR-63 behavior). Any LF project not yet voiced picks up the new names.
- Already-voiced vignettes that say "Meera", "Arjun" or "Dev" are marked **needs re-voice**. Only the vignette lines are re-voiced; bank narration doesn't contain character names.
- New cast reference images: generate one turnaround still per character (front, three-quarter, side) in the channel style, then lock them as the cast's reference stills.

---

## 3. Acceptance
- No string `Meera`, `Arjun`, `Mumbai`, `meera_v1` or `arjun_v1` remains in cast data or prompt templates.
- A generated LF-03 vignette names Alex, Maya and Leo, and passes the new amber lint with zero hits.
- Visual prompts carry the bank's identity block unchanged in every shot that shows a cast member.
- Existing rendered projects open unchanged. Unvoiced LF projects show the new names after re-import.
