# Fonts used to draw carousel slides

These static font files are used by `src/lib/carouselFonts.ts` to draw carousel slides on the server. Satori (behind
`next/og`) cannot use the variable fonts the app loads for the screen, so static files are kept here.

| File | Family | Licence |
|---|---|---|
| BricolageGrotesque-ExtraBold.woff | Bricolage Grotesque, weight 800 | SIL Open Font License 1.1 |
| DMSans-Regular.woff, DMSans-Medium.woff, DMSans-Italic.woff | DM Sans, weights 400 and 500, and 400 italic (the italic subtext) | SIL Open Font License 1.1 |
| DMMono-Medium.woff | DM Mono, weight 500 | SIL Open Font License 1.1 |
| Anton-Regular.woff | Anton, weight 400 (the Kraft zine theme's headline) | SIL Open Font License 1.1 |
| PlayfairDisplay-BoldItalic.woff | Playfair Display, weight 700 italic (the Kraft zine theme's accent phrase) | SIL Open Font License 1.1 |
| PermanentMarker-Regular.woff | Permanent Marker, weight 400 (the Kraft zine theme's tape labels and hand-written notes) | Apache License 2.0 (not the OFL; it also allows redistribution) |

The files come from the `@fontsource` packages (Latin subset), which redistribute the upstream fonts unchanged.
The full licence text is at https://openfontlicense.org/open-font-license-official-text/. Each family keeps its own
copyright notice from its project (Permanent Marker is the one Apache-licensed family):

- Bricolage Grotesque: Copyright 2022 The Bricolage Grotesque Project Authors (https://github.com/ateliertriay/bricolage)
- DM Sans and DM Mono: Copyright 2019 The DM Sans and DM Mono Project Authors (https://github.com/googlefonts/dm-fonts)
- Anton: Copyright 2020 The Anton Project Authors (https://github.com/googlefonts/AntonFont.git)
- Playfair Display: Copyright 2017 The Playfair Display Project Authors (https://github.com/clauseggers/Playfair-Display)
- Permanent Marker: Copyright 2010 Font Diner, Inc. DBA Stereotypes (licensed under the Apache License, Version 2.0: https://www.apache.org/licenses/LICENSE-2.0)

Fonts that are not open-licensed (for example Cooper Black, Satoshi) are not bundled: this repository is public, so a
font file committed here is redistributed. A theme that needs one would have to load it from private storage.
