# Bird Quiz (Czech)

A simple 15-round bird quiz web page.

## Data format

The quiz loads `data/birds.csv` (no database, no build step).

CSV columns:

1. `imageSrc` - URL to the bird picture **or** a relative path like `images/sparrow.jpg`
2. `czechName` - correct bird name in Czech
3. `info` - short interesting text shown after the player answers

Header example:

```csv
imageSrc,czechName,info
"images/sparrow.jpg","vrabec domácí","Zajímavost o vrabci..."
```

## Current data (from your XLSX)

I extracted the embedded bird pictures from `ptaci_tabulka.xlsx` and generated:

- `images/` (JPEG files with the bird pictures)
- `data/birds.csv` (pairs `images/<file>` with the correct Czech name)

## Scoring rules

- Start at `0` points.
- Correct answer: `+1`
- Wrong answer: `-1`
- After 15 rounds, you see the final score and can restart.

## Run locally

Because the page uses `fetch()` to load the CSV, open it via a local web server (not `file://`).

Example (from this folder):

```bash
python3 -m http.server 8000
```

Then open: `http://localhost:8000/`

## Deploy to GitHub Pages

1. Create a new GitHub repository (any name), then push this folder contents to it.
2. Go to your repository settings -> **Pages**.
3. Set **Source** to `main` branch and `/ (root)` folder.
4. After a minute, open the “Your site is live at …” link.

