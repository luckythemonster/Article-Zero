import re

with open('src/index.css', 'r') as f:
    content = f.read()

# Delete duplicate map rules
duplicate_start = content.find('.wall-terminal__map {', content.find('.hvac__room'))
if duplicate_start != -1:
    duplicate_end = content.find('/* ── Glitch Overlay ──────────────────────────────────────────────────────── */', duplicate_start)
    if duplicate_end != -1:
        content = content[:duplicate_start] + content[duplicate_end:]

with open('src/index.css', 'w') as f:
    f.write(content)

print("done")
