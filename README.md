# delphitools

A collection of small, low stakes and low effort tools.
No logins, no registration, no data collection.
I can't believe I have to say that. 
Long live the handmade web.

## Included tools

### social media

- social media cropper
- matte genny
- seamless scroll genny
- watermarker

### colour

- colour converter (hex, rgb, hsl, oklch, lab, lch, oklab)
- tailwind shade genny
- harmony genny
- palette genny
- palette collection
- palette extractor
- pixel picker
- contrast checker
- colour blindness simulator
- gradient genny

### img & assets

- favicon genny
- svg optimiser
- placeholder genny
- image splitter
- image converter
- image clipper
- artwork enhancer
- background remover
- image tracer
- paste image

### typo & text

- px to rem
- line height calc
- typo calc (agates, ciceros, picas, pt, inches, mm)
- paper sizes
- word counter
- text diff
- glyph browser
- font file explorer
- text editor (distraction-free, live-preview markdown writer)
- document converter (pandoc in your browser — markdown ⇄ html, word, odt, epub, latex, rst & more)

### print & production

- pdf preflight
- zine imposer
- print imposer

### other tools

- text scratchpad
- tailwind cheat sheet
- qr genny
- barcode genny
- meta tag genny
- regex tester
- cipher decoder

### calculators

- scientific calc
- graph calc
- algebra calc
- base converter
- time calc
- unit converter
- encoding tools

### turbo-nerd shit

- shavian transliterator


## **Self-Host Guide with Docker**

- **Build locally:**  
```bash
docker build -t delphitools:latest .
# Optional: stamp the in-app version label (shown when hovering the logo).
# .git is not in the build context, so pass the SHA explicitly:
docker build --build-arg COMMIT_SHA=$(git rev-parse --short HEAD) -t delphitools:latest .
```

- **Run locally:**  
```bash
# serve on http://localhost:3000 
docker run --rm -p 3000:80 delphitools:latest
```

- **With docker-compose:**  
```bash
## to start the container
docker-compose up -d --build
## stamp the version label too (otherwise it shows "dev"):
COMMIT_SHA=$(git rev-parse --short HEAD) docker-compose up -d --build
## to stop the container
docker-compose down
```
