![altema](https://github.com/user-attachments/assets/1807d0b4-74de-4be5-a970-45f607ed1b71)

# Altema - Reclaim Your Family History

A userscript that downloads all media from your Ancestry family tree and optional GED export.

## Features

- **Complete media backup**: Downloads all photos from your Ancestry tree
- **Automatic organization**: Sorts images into folders by person name
- **Multi-threaded processing**: Uses 5 parallel threads for fast analysis
- **GED file download**: Attempts to download your family tree data

## Installation

1. Install a userscript manager:
   - **Chrome/Edge**: [Tampermonkey](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
   - **Firefox**: [Tampermonkey](https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/) or [Greasemonkey](https://addons.mozilla.org/en-US/firefox/addon/greasemonkey/)

2. Click [here to install the script](https://github.com/lolitemaultes/Altema/raw/refs/heads/main/altema.user.js) or copy the script into your userscript manager

3. Navigate to your Ancestry tree's memories page

## Usage

1. Go to your Ancestry tree's memories page: `ancestry.com/family-tree/tree/YOUR-TREE-ID/memories`
2. The Altema interface will appear in the top-right corner
3. Click **"MEDIA HARVEST"** to start the complete process
4. The script will:
   - Attempt to download your tree's GED file
   - Auto-scroll to load all photos
   - Analyze each photo using Ancestry's APIs
   - Download full-resolution images with embedded metadata
   - Create an organized ZIP file

## Output Structure

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

## Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Not tested

## Limitations

- Only works on memories pages where photos are displayed
- Requires active Ancestry login session
- Some private trees may have restricted access
- GED download depends on Ancestry's API availability

## Privacy

- Script runs entirely in your browser
- No data sent to external servers
- Uses your existing Ancestry login session
- All downloads are local to your computer

## Credits

Created by lolitemaultes

## License

This project is for educational and personal backup purposes. Respect Ancestry's terms of service and only download content you have rights to access.
