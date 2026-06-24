import re

with open('src/index.css', 'r') as f:
    content = f.read()

# Need to update the /* No raster assets... */ comment because there are raster assets now
pattern = r'/\* ========================================================================\n\s*WALL TERMINAL / DOOR KEYPAD — pure-CSS retro-futuristic sci-fi terminal\n\s*No raster assets\. Grungy green/amber phosphor on dark grimy panels\.\n\s*======================================================================== \*/'
replacement = '/* ========================================================================\n   WALL TERMINAL / DOOR KEYPAD — Uses raster chassis assets.\n   ======================================================================== */'

content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open('src/index.css', 'w') as f:
    f.write(content)

print("done")
