# Fonts used to draw carousel slides

These static font files are used by `src/lib/carouselFonts.ts` to draw carousel slides on the server. Satori (behind
`next/og`) cannot use the variable fonts the app loads for the screen, so static files are kept here.

| File | Family | Licence |
|---|---|---|
| BricolageGrotesque-ExtraBold.woff | Bricolage Grotesque, weight 800 | SIL Open Font License 1.1 |
| DMSans-Regular.woff, DMSans-Medium.woff, DMSans-Italic.woff | DM Sans, weights 400 and 500, and 400 italic (the italic subtext) | SIL Open Font License 1.1 |
| DMMono-Medium.woff | DM Mono, weight 500 | SIL Open Font License 1.1 |

The files come from the `@fontsource` packages (Latin subset), which redistribute the upstream fonts unchanged.
The full licence text is at https://openfontlicense.org/open-font-license-official-text/. Each family keeps its own
copyright notice from its project:

- Bricolage Grotesque: Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)
- DM Sans and DM Mono: Copyright 2019 The DM Sans and DM Mono Project Authors (https://github.com/googlefonts/dm-fonts)
