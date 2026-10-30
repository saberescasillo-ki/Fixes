import json,os,sys,glob,re
sys.path.insert(0,os.path.dirname(os.path.abspath(__file__))); import lenient
root=sys.argv[1]; van=sys.argv[2]
def L(p): return json.loads(lenient.strip(open(p,encoding='utf-8-sig').read())[0])
def defs(base):
  A,C,R,G,P={}, {}, {}, set(), set()
  for f in glob.glob(base+'/animations/*.json'): A.update({k:f for k in L(f).get('animations',{})})
  for f in glob.glob(base+'/animation_controllers/*.json'): C.update({k:(f,v) for k,v in L(f).get('animation_controllers',{}).items()})
  for f in glob.glob(base+'/render_controllers/**/*.json',recursive=True): R.update({k:f for k in L(f).get('render_controllers',{})})
  for f in glob.glob(base+'/models/**/*.json',recursive=True):
    d=L(f)
    for g in d.get('minecraft:geometry',[]): G.add(g['description']['identifier'])
    for k in d:
      if k.startswith('geometry.'): G.add(k.split(':')[0])
  for f in glob.glob(base+'/particles/*.json'): P.add(L(f)['particle_effect']['description']['identifier'])
  return A,C,R,G,P
A,C,R,G,P=defs(root); vA,vC,vR,vG,vP=defs(van)
for sp in glob.glob(root+'/subpacks/*/'):
  _,_,r,_,_=defs(sp.rstrip('/')); print('subpack',os.path.basename(sp.rstrip('/')),'defines RCs:',len(r))
  R.update({k:'SUBPACK:'+os.path.basename(sp.rstrip('/')) for k in r})
e=L(root+'/entity/player.entity.json')['minecraft:client_entity']['description']
amap=e['animations']
print('== entity animation map targets missing')
for s,t in amap.items():
  if t not in A and t not in C and t not in vA and t not in vC: print('  ',s,'->',t)
print('== animate list short names missing from map')
for a in e['scripts']['animate']:
  for n in (a if isinstance(a,dict) else [a]):
    if n not in amap: print('  ',n)
print('== RCs missing (main pack only / anywhere)')
for rc in e['render_controllers']:
  for n in rc:
    if n not in R and n not in vR: print('  missing everywhere',n)
    elif str(R.get(n,'')).startswith('SUBPACK'): print('  only in subpack',n,R[n])
print('== geometries missing')
for k,g in e['geometry'].items():
  if g not in G and g not in ('geometry.humanoid.custom','geometry.cape'): print('  ',k,g)
print('== particles missing')
for k,p in e.get('particle_effects',{}).items():
  if p not in P: print('  ',k,p)
print('== textures missing')
for k,t in e['textures'].items():
  if not any(os.path.exists(root+'/'+t+x) or os.path.exists(van+'/'+t+x) for x in ('.png','.tga')): print('  ',k,t)
print('== controllers: short names used but not mapped / missing states')
allC={**{k:v for k,v in vC.items()},**C}
for cid,(f,c) in C.items():
  if cid not in amap.values(): print('  (unused controller)',cid); continue
  st=c['states']; init=c.get('initial_state','default')
  if init not in st: print('  ',cid,'initial state missing',init)
  for sn,s in st.items():
    for a in s.get('animations',[]):
      for n in (a if isinstance(a,dict) else [a]):
        if n not in amap: print('  ',cid,sn,'uses unmapped',n)
    for t in s.get('transitions',[]):
      for d in t:
        if d not in st: print('  ',cid,sn,'-> missing state',d)
    for x in s.get('particle_effects',[]):
      if x.get('effect') not in e.get('particle_effects',{}): print('  ',cid,sn,'particle short missing',x.get('effect'))
    for x in s.get('sound_effects',[]):
      if x.get('effect') not in e.get('sound_effects',{}): print('  ',cid,sn,'sound short missing',x.get('effect'))
print('== unused animations (not mapped):', len([a for a in A if a not in amap.values()]))
