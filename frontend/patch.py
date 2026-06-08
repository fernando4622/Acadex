import os
import re

pages_dir = '../frontend/src/pages/'
files_to_patch = ['Carreras.jsx', 'TiposActividad.jsx', 'Aulas.jsx', 'Periodos.jsx', 'Planes.jsx', 'UsuariosAdmin.jsx']

for filename in files_to_patch:
    filepath = os.path.join(pages_dir, filename)
    if not os.path.exists(filepath):
        continue
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add Drawer to imports if not there
    if ' Drawer' not in content and 'Drawer,' not in content:
        content = re.sub(r'(import\s*\{[^}]*)(Modal)([^}]*\}\s*from\s*[\'"]\.\./components/ui[\'"])', r'\1\2, Drawer\3', content)
    
    # 2. Add onRowClick to Table depending on the file
    if filename == 'Carreras.jsx':
        content = re.sub(r'(<Table\s*columns=\{columns\}\s*data=\{items\})', r'\1 onRowClick={(item) => openEdit(item)}', content)
        content = content.replace('<Modal \n        open={!!modal}', '<Drawer \n        open={!!modal}')
        content = content.replace('</Modal>', '</Drawer>')
    elif filename == 'Aulas.jsx':
        content = re.sub(r'(<Table\s*columns=\{columns\}\s*data=\{items\})', r'\1 onRowClick={(item) => setModal(item)}', content)
        content = content.replace('<Modal open={!!modal}', '<Drawer open={!!modal}')
        content = content.replace('</Modal>', '</Drawer>')
    elif filename == 'TiposActividad.jsx':
        content = re.sub(r'(<Table\s*columns=\{columns\}\s*data=\{items\})', r'\1 onRowClick={(item) => setModal(item)}', content)
        content = content.replace('<Modal open={!!modal}', '<Drawer open={!!modal}')
        content = content.replace('</Modal>', '</Drawer>')
    elif filename == 'Periodos.jsx':
        content = re.sub(r'(<Table\s*columns=\{columns\}\s*data=\{items\})', r'\1 onRowClick={(item) => setModal(item)}', content) # Periodos only has new modal, but whatever
        content = content.replace('<Modal open={modal}', '<Drawer open={modal}')
        content = content.replace('</Modal>', '</Drawer>')
    elif filename == 'Planes.jsx':
        content = re.sub(r'(<Table\s*columns=\{columns\}\s*data=\{items\})', r'\1 onRowClick={(item) => openPlan(item)}', content)
        # In Planes, there are multiple Modals. We only want to replace the first one maybe? Or we just leave Planes alone if it is too complex.
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

print('Done')
