"""Add only the new map UI labels, retaining existing reviewed translations."""
from pathlib import Path
import importlib.util
import json

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('translator',ROOT/'scripts/translate-app-locales.py')
translator=importlib.util.module_from_spec(spec);spec.loader.exec_module(translator)
LABELS={
    'Cinder_Fast_Travel':"Cinder's Cradle Fast Travel",'Named_Area':'Named Areas',
    'Physical_Inscription':'Physical Inscriptions','Lore_Acquisition':'Lore Acquisition Locations',
    'Fixed_Other':'Other Fixed Item Sources','Fixed_Equipment':'Fixed Equipment Sources',
    'Fixed_Weapons':'Fixed Weapon Sources','Fixed_Building':'Fixed Building and Unlock Sources',
    'Fixed_Instruments':'Fixed Instrument Sources','Miniature_Model':'Embervale Miniature Model',
    'Painting':'Paintings','Meteorite':'Meteorites','Hollow_Artifact':'Hollow Artifacts','Orrery':'Orrery',
}
TURKISH={
    'Cinder_Fast_Travel':"Cinder's Cradle Hızlı Seyahat Noktaları",'Named_Area':'Adlandırılmış Bölgeler',
    'Physical_Inscription':'Yazıtlar','Lore_Acquisition':'Hikâye Kaydı Edinme Noktaları',
    'Fixed_Other':'Diğer Sabit Eşya Noktaları','Fixed_Equipment':'Sabit Ekipman Noktaları',
    'Fixed_Weapons':'Sabit Silah Noktaları','Fixed_Building':'Yapı Malzemesi ve Tarif Açma Noktaları',
    'Fixed_Instruments':'Sabit Enstrüman Noktaları','Miniature_Model':'Embervale Minyatür Modeli',
    'Painting':'Tablolar','Meteorite':'Meteor Taşları','Hollow_Artifact':'Hollow Eserleri','Orrery':'Güneş Sistemi Modeli',
}
def main():
    out=ROOT/'research/map-update-2026-11-16/ui-locales';out.mkdir(parents=True,exist_ok=True)
    sources={f'map.enshrouded.groups.{k}':v for k,v in LABELS.items()}
    sources['map.enshrouded.loreEntry']='Lore Entry'
    official=json.loads((ROOT/'public/data/enshrouded/locales/source.json').read_text(encoding='utf-8'))
    tags={tag:i for i,tag in enumerate(official['keys'])}
    for code,game_code in translator.LANGUAGES.items():
        file=translator.LOCALES/f'{code.lower()}.json'
        tree=json.loads(file.read_text(encoding='utf-8'))
        cache=out/f'{code.lower()}.json'
        if code=='en':values=sources
        elif code=='tr':values={**{f'map.enshrouded.groups.{k}':v for k,v in TURKISH.items()},'map.enshrouded.loreEntry':'Hikâye Kaydı'}
        elif cache.exists():values=json.loads(cache.read_text(encoding='utf-8'))
        else:values=translator.translate_chunk(code,list(sources.items()))
        game=json.loads((ROOT/'public/data/enshrouded/locales'/f'{game_code.replace("_","-").lower()}.json').read_text(encoding='utf-8'))['values']
        values['map.enshrouded.groups.Cinder_Fast_Travel']=game[tags['661006542']]+' · '+game[tags['1315318910']]
        values['map.enshrouded.groups.Orrery']=game[tags['2402664782']]
        values['map.enshrouded.groups.Painting']=game[tags['3712463701']]
        values['map.enshrouded.groups.Miniature_Model']=game[tags['2031688141']]
        for k,v in values.items():translator.set_value(tree,k,v)
        file.write_text(json.dumps(tree,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        cache.write_text(json.dumps(values,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print('Map labels:',code,flush=True)
if __name__=='__main__':main()
