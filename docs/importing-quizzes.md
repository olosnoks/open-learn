# Importing quizzes

Go to **Quizzes**, then **Import from spreadsheet** (`/quizzes/import`). Upload a `.csv`, `.tsv` or `.json` file, or paste rows copied from Google Sheets or Excel into the text box. The page has a **Download template** button that gives you a CSV with one example of each importable type.

Before anything is saved you see a preview with the correct answers ticked. Rows with problems are listed with their spreadsheet row number and skipped; the rest import. The quiz title is taken from the file name (`Science-week.csv` becomes "Science week") and can be edited before saving.

The parser is `src/features/quiz-import/parseQuiz.ts`; it is pure and unit tested in `tests/unit/parseQuiz.test.ts`.

## Spreadsheet format

One row per question. The first row must be a header. Column order does not matter, and extra columns are ignored.

| Column | Required | Meaning |
| --- | --- | --- |
| `question` | yes | The question text (up to 500 characters). Also accepted: `prompt`, `q`, `question text` |
| `type` | no | Blank means multiple choice (or true/false if there are no answers and `correct` is true/false). Values: `quiz`, `multi`, `truefalse`, `type`, `poll`, `puzzle`, `slide`. Also accepted as the header: `question type`, `kind` |
| `answer1` to `answer6` | depends | The answer options. For `puzzle`, in the correct order. For `type`, every accepted spelling. For `slide`, the body text. Also accepted: `option1`, `choice1`, `a1` |
| `correct` | depends | Which answer is right, as a **number** (`2`, or `1,3` for several), a letter (`B`, `A,C`) or the answer text itself. `true`/`false` for true/false questions. Also accepted: `correct answer`, `answer key`, `key` |
| `time` | no | Seconds, 5 to 240, default 20. Also accepted: `time limit`, `seconds`, `timer` |
| `points` | no | 0 to 2000, default 1000 (default 0 for `poll` and `slide`). Also accepted: `score`, `pts` |

Header names are matched case-insensitively, and spaces, underscores and hyphens are interchangeable.

Type aliases: `quiz` = `single` = `mc` = `multiple choice` = `choice`; `multi` = `multi_select` = `multiple` = `checkbox`; `truefalse` = `true_false` = `true/false` = `tf`; `type` = `type_answer` = `text` = `open`; `poll` = `survey`; `puzzle` = `order` = `ordering` = `sequence`; `slide` = `info`.

Delimiters: comma, semicolon and tab are detected from the header row, so Excel exports from European locales (semicolons) and pasted sheets (tabs) both work. Quote a field that contains the delimiter or a line break (`"1,3"`), and double any quote marks inside it. A leading byte-order mark is ignored.

### Rules per type

| `type` | Answers | `correct` |
| --- | --- | --- |
| `quiz` (or blank) | 2 to 4 | exactly one. If you give several numbers with a blank type, the row is imported as `multi` |
| `multi` | 2 to 6 | one or more, for example `1,3` |
| `truefalse` | none | `true` or `false` (also `yes`/`no`, `t`/`f`, `1`/`0`) |
| `type` | 1 or more accepted spellings in the answer columns (or one in `correct`) | not needed; matching ignores case and surrounding spaces |
| `poll` | 2 or more | ignored; never scored |
| `puzzle` | 3 or more, in the correct order | ignored; players see them shuffled |
| `slide` | `answer1` is the body text (several answer columns are joined with line breaks) | ignored; never scored |

### Examples

The downloadable template, which covers every spreadsheet-importable type:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
What is the capital of France?,quiz,Paris,Rome,Madrid,Berlin,1,20,1000
Which of these are prime numbers?,multi,2,4,7,9,"1,3",30,1000
The Earth orbits the Sun.,truefalse,,,,,true,10,500
Type the chemical symbol for water,type,H2O,H₂O,,,,20,1000
Put these planets in order from the Sun,puzzle,Mercury,Venus,Earth,Mars,,30,1000
Which topic should we do next?,poll,Space,Oceans,Dinosaurs,,,20,0
```

Row by row:

**Multiple choice** (`quiz`), correct answer by number. The type column can be left blank:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
What is the capital of France?,,Paris,Rome,Madrid,Berlin,1,20,1000
```

The same question with the correct answer as a letter or as text:

```csv
question,answer1,answer2,answer3,answer4,correct
What is the capital of France?,Paris,Rome,Madrid,Berlin,A
What is the capital of France?,Paris,Rome,Madrid,Berlin,Paris
```

**Multi-select** (`multi`), two correct answers. Quote the list because it contains a comma:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
Which of these are prime numbers?,multi,2,4,7,9,"1,3",30,1000
```

**True/false** (`truefalse`), no answer columns:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
The Earth orbits the Sun.,truefalse,,,,,true,10,500
```

**Type answer** (`type`), every answer column is an accepted spelling:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
Type the chemical symbol for water,type,H2O,h2o,water,,,20,1000
```

**Puzzle** (`puzzle`), answers in the correct order, at least three:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
Put these planets in order from the Sun,puzzle,Mercury,Venus,Earth,Mars,,30,1000
```

**Poll** (`poll`), no correct answer, 0 points:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
Which topic should we do next?,poll,Space,Oceans,Dinosaurs,,,20,0
```

**Slide** (`slide`), the question is the heading and `answer1` is the body:

```csv
question,type,answer1,answer2,answer3,answer4,correct,time,points
Next up: the water cycle,slide,"Evaporation, condensation, precipitation. Three questions follow.",,,,,15,0
```

A real set in this format: `quizzes/security-plus-practice-set-1.csv` (ten `quiz` rows with letter answers).

### Common errors

| Message | Fix |
| --- | --- |
| First row must be a header with a "question" column | Add a header row; the question column must be named `question` (or an alias above) |
| needs a correct answer | Fill in `correct` for `quiz`/`multi` rows |
| correct answer number N doesn't match an answer column | `correct` points past the last filled answer |
| type "quiz" allows one correct answer | Use `multi` for several correct answers |
| quiz questions need 2-4 answers / multi questions need 2-6 answers | Add or remove answer columns |
| puzzle questions need at least 3 answers | Add items |
| true/false question needs "true" or "false" | Put `true` or `false` in `correct` |
| time must be between 5 and 240 seconds / points must be between 0 and 2000 | Adjust the number |

## JSON format

JSON import accepts the exact payload `POST /api/quizzes` takes, or a bare array of questions. It is the only way to import `slider`, `drop_pin` and `scale` questions, and it lets you set `caseSensitive`, `tolerance` and other options the spreadsheet format does not expose.

```json
{
  "title": "Geography warm-up",
  "questions": [
    {
      "prompt": "What is the capital of France?",
      "timeLimitSec": 20,
      "points": 1000,
      "type": {
        "type": "quiz",
        "choices": [
          { "id": "a", "label": "Paris", "isCorrect": true },
          { "id": "b", "label": "Rome", "isCorrect": false },
          { "id": "c", "label": "Madrid", "isCorrect": false }
        ]
      }
    },
    {
      "prompt": "Which are prime?",
      "type": {
        "type": "multi_select",
        "choices": [
          { "id": "a", "label": "2", "isCorrect": true },
          { "id": "b", "label": "4", "isCorrect": false },
          { "id": "c", "label": "7", "isCorrect": true }
        ],
        "partialCredit": false
      }
    },
    { "prompt": "The Earth orbits the Sun.", "points": 500, "type": { "type": "true_false", "correct": true } },
    {
      "prompt": "Chemical symbol for water?",
      "type": { "type": "type_answer", "acceptedAnswers": ["H2O", "h2o"], "caseSensitive": false }
    },
    {
      "prompt": "Order the planets from the Sun",
      "type": {
        "type": "puzzle",
        "items": [
          { "id": "p1", "label": "Mercury" }, { "id": "p2", "label": "Venus" },
          { "id": "p3", "label": "Earth" }, { "id": "p4", "label": "Mars" }
        ],
        "correctOrder": ["p1", "p2", "p3", "p4"]
      }
    },
    {
      "prompt": "Which topic next?",
      "points": 0,
      "type": { "type": "poll", "choices": [{ "id": "a", "label": "Space" }, { "id": "b", "label": "Oceans" }] }
    },
    { "prompt": "Next: the water cycle", "points": 0, "type": { "type": "slide", "body": "Three questions follow." } },
    {
      "prompt": "How many bones in an adult human body?",
      "type": { "type": "slider", "min": 150, "max": 250, "step": 1, "correct": 206, "tolerance": 3 }
    },
    {
      "prompt": "Tap Paris on the map",
      "type": {
        "type": "drop_pin",
        "imageUrl": "https://example.com/europe.png",
        "correctX": 0.42, "correctY": 0.55, "tolerance": 0.08
      }
    },
    {
      "prompt": "How confident do you feel about today's topic?",
      "points": 0,
      "type": { "type": "scale", "minLabel": "Not at all", "maxLabel": "Very", "steps": 5 }
    }
  ]
}
```

Notes:

- `timeLimitSec` defaults to 20 and `points` to 1000 when omitted.
- The config may be under `type` (as above) or `config`.
- Choice and item `id`s only need to be unique within the question; the server assigns new question ids on save.
- `drop_pin` coordinates are fractions of the image width and height (0 to 1), measured from the top-left corner. `tolerance` is a fraction too.
- `slider.correct` is optional; without it the question is never scored as correct, so give it 0 points or use it in lecture mode.
- The field rules are the zod schemas in `src/shared/schemas.ts` (`QuestionConfigSchema`); the import page shows the first validation message for a rejected question.
