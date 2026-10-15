LONG-FORM THUMBNAIL IMAGES (CR-88)
1. Flow: set the image aspect ratio to LANDSCAPE 16:9 before generating. The prompt alone cannot change this.
2. One line per image: LF03-T1, LF03-T2 (two variants per episode). Keep the ID at the start of the line. Produce LF03 first (flagship).
3. The thumbnail headline is added by the app afterwards (2 to 4 words, from the bank's "Thumb text"). Do not put text, empty areas or "space for text" in the image prompt; the face is large and the whole frame is full artwork.
4. Check the finished thumbnail at 120 pixels wide: the face and the headline must both still read.
5. Check the downloads with: python fix_framing.py check <folder> --size 1920x1080 (reports size and aspect only).
