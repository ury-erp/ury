import os

files_to_update = [
    "package.json",
    "AGENTS.MD",
    "FEATURES.md",
    "SETUP.md",
    "Mosaic/AGENTS.MD",
    "Mosaic/vite.config.js",
    "Mosaic/package.json",
    "Mosaic/src/router/index.js",
    "Mosaic/src/components/kot.vue",
    "ury/hooks.py"
]

for filepath in files_to_update:
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            content = f.read()
        
        # Replace occurrences
        new_content = content.replace("URYMosaic", "Mosaic").replace("urymosaic", "mosaic")
        
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")
    else:
        print(f"Skipped {filepath} (Not found)")

