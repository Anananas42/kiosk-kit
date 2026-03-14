#!/usr/bin/env python3
import struct, os

magic = 0x72756358
header = 16
version = 0x10000
ntoc = 1
toc_type = 0xfffd0002
toc_subtype = 1
toc_pos = 28
img_header = 36
img_type = 0xfffd0002

data = struct.pack('<IIII', magic, header, version, ntoc)
data += struct.pack('<III', toc_type, toc_subtype, toc_pos)
data += struct.pack('<IIIIIIIII', img_header, img_type, 1, 1, 1, 1, 0, 0, 1)
data += struct.pack('<I', 0x00000000)

cursor_dir = '/usr/share/icons/emptycursor/cursors'
os.makedirs(cursor_dir, exist_ok=True)

with open(os.path.join(cursor_dir, 'default'), 'wb') as f:
    f.write(data)

for name in ['left_ptr', 'arrow', 'top_left_arrow', 'pointer', 'hand1', 'hand2', 'xterm', 'text', 'watch', 'wait', 'progress']:
    link = os.path.join(cursor_dir, name)
    if os.path.exists(link):
        os.remove(link)
    os.symlink('default', link)

with open('/usr/share/icons/emptycursor/cursor.theme', 'w') as f:
    f.write('[Icon Theme]\nName=emptycursor\nComment=Transparent cursor theme\n')

print('done')
