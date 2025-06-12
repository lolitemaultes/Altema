![altema](https://github.com/user-attachments/assets/1807d0b4-74de-4be5-a970-45f607ed1b71)

[![Install Altema](https://img.shields.io/badge/INSTALL-Altema-3DC296?style=for-the-badge&logo=github)](https://github.com/lolitemaultes/Altema/raw/refs/heads/main/altema.user.js)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[![Install Tampermonkey](https://img.shields.io/badge/INSTALL-Tampermonkey-blue?style=for-the-badge&logo=tampermonkey)](https://www.tampermonkey.net/)&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;[![Install Greasemonkey](https://img.shields.io/badge/INSTALL-Greasemonkey-orange?style=for-the-badge&logo=greasemonkey)](https://www.greasespot.net/greasemonkey/)

# Altema - Reclaim Your Family History

Altema empowers you to back up your entire Ancestry.com tree in a single click, exporting your GEDCOM file alongside every photo and document you’ve ever uploaded. This tool is a lifeline for anyone fed up with manual downloads and for those who hope to reclaim and preserve their entire family archive in one effortless sweep.

## Features

- **Complete media backup**: Downloads all photos from your Ancestry tree
- **Automatic organization**: Sorts images into folders by person name
- **Multi-threaded processing**: Uses 5 parallel threads for fast analysis
- **GED file download**: Attempts to download your family tree data

## Installation

1. Ensure you have a userscript manager installed
   - **Tampermonkey**: https://www.tampermonkey.net/
   - **Greasemonkey**: https://www.greasespot.net/greasemonkey/

2. Install the userscript with the button above or [click here](https://github.com/lolitemaultes/Altema/raw/refs/heads/main/altema.user.js)

3. Navigate to your Ancestry family tree and Altema will do the rest

## Download Structure

```
TreeName_complete_2025-01-15.zip
├── TreeName.ged                    # Family tree file (if available)
└── ancestry_media/
    ├── John_Smith/
    │   ├── wedding_photo.jpg       # Original filename with EXIF
    │   └── family_portrait.jpg
    ├── Mary_Johnson/
    │   └── graduation.jpg
    └── Unknown_People/
        └── unidentified_photo.jpg
```

## GED Download Notes

GED file download may fail due to Ancestry API restrictions. If this happens:
1. Go to your tree settings in Ancestry
2. Look for "Export tree" options
3. Download the GED file manually
4. Use Altema for comprehensive media backup

## Privacy

- Script runs entirely in your browser
- No data sent to external servers
- Uses your existing Ancestry login session
- All downloads are local to your computer

## Credits

This project was created by lolitemautles with intent for educational and personal backup purposes. Please respect Ancestry's terms of service and only download content you have rights to access.
