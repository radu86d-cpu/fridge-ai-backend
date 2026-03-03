import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

if (!process.env.OPENAI_API_KEY) {
  console.warn("⚠️ OPENAI_API_KEY lipseste din .env");
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const BASE_PANTRY = [
  "sare",
  "piper",
  "zahar",
  "ulei",
  "apa",
  "faina",
  "otet",
  "usturoi",
  "ceapa",
  "boia",
  "lamaie",
];

/* ===============================
   PARSE RECEIPT
================================ */

app.post("/parse-receipt", async (req, res) => {
  try {
    const { text } = req.body;

    const prompt = `
Extrage doar produsele alimentare si cantitatile din text.
Ignora preturi, TVA, total, card, data, ora.

Returneaza STRICT JSON array:

[
  { "name": "produs", "quantity": number, "unit": "g/ml/buc/L" }
]

Text:
${text}
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    let aiText = response.choices[0]?.message?.content ?? "[]";
    aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();

    const parsed = JSON.parse(aiText);
    res.json({ result: parsed });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Parsing failed" });
  }
});

/* ===============================
   GENERATE RECIPES (UPGRADED AI)
================================ */

app.post("/generate-recipes", async (req, res) => {
  try {
    const { items, mustUse = [], preferences = {}, filters = {} } = req.body;
    if (!items || items.length === 0) {
  return res.json({ recipes: [] });
}

    const experience = filters.experience?.length
  ? filters.experience.join(", ")
  : null;

const category = filters.mealType ?? null;
const cuisine = filters.cuisine ?? null;

    const inventoryText = items
      .map((i) => `- ${i.name}: ${i.quantity} ${i.unit}`)
      .join("\n");

    const mandatoryText =
      mustUse.length > 0
        ? `
OBLIGATORIU:
FIECARE reteta trebuie sa contina TOATE aceste ingrediente:
${mustUse.join(", ")}

Daca o reteta NU contine TOATE ingredientele obligatorii,
NU o returna.
`
        : `
Nu exista ingrediente obligatorii.
Genereaza retete variate.
`;

    const preferenceBlock = `
CERINTE STIL:

Experienta culinara: ${experience ?? "fara restrictii"}
Categorie preparat: ${category ?? "fara restrictii"}
Stil gastronomic: ${cuisine ?? "fara restrictii"}

Reguli pentru stil:
- Respecta STRICT cerintele daca sunt specificate.
- Daca exista mai multe experiente selectate, combina stilurile armonios.
- Daca este selectata o categorie, toate retetele trebuie sa apartina acelei categorii.
- Daca este selectata o bucatarie, foloseste tehnici si ingrediente specifice acelei bucatarii.
`;

    const prompt = `
Esti un bucatar profesionist cu experienta internationala.

Genereaza EXACT 5 retete diferite.

${mandatoryText}

${preferenceBlock}

Reguli generale:
1. Foloseste DOAR ingredientele din inventar + ingrediente de baza.
2. Nu inventa ingrediente care nu exista in inventar.
3. Returneaza STRICT JSON valid.
4. Nu adauga explicatii sau text suplimentar.

Ingrediente de baza permise:
${BASE_PANTRY.join(", ")}

Inventar:
${inventoryText}

Format STRICT:

[
  {
    "name": "Nume reteta",
    "timeMinutes": 20,
    "difficulty": "usor|mediu|greu",
    "ingredients": [
      { "name": "ingredient", "quantity": 200, "unit": "g" }
    ],
    "steps": [
      "pas 1",
      "pas 2"
    ]
  }
]
`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 1.0,
    });

    let aiText = response.choices[0]?.message?.content ?? "[]";
    aiText = aiText.replace(/```json/g, "").replace(/```/g, "").trim();

    let parsed = JSON.parse(aiText);

    // =============================
    // VALIDARE SERVER
    // =============================

    if (mustUse.length > 0) {
      parsed = parsed.filter((recipe) => {
        if (!recipe.ingredients) return false;

        const ingredientNames = recipe.ingredients.map((i) =>
          i.name.toLowerCase()
        );

        return mustUse.every((m) =>
          ingredientNames.includes(m.toLowerCase())
        );
      });
    }

    res.json({ recipes: parsed });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Recipe generation failed" });
  }
});

app.listen(3000, () => {
  console.log("Server running on port 3000");

});
