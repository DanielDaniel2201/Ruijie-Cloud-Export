export async function selectRuijieProject(page, value) {
  const projectName = typeof value === 'string' ? value.trim() : '';
  if (!projectName) throw new Error('project must be a non-empty project name.');

  const currentName = () => page.evaluate(() => document.querySelector('.groupbar-name')?.textContent?.trim() || '');
  let current = '';
  for (let attempt = 0; attempt < 30 && !current; attempt++) {
    current = await currentName();
    if (!current) await page.sleep(0.5);
  }
  if (!current) throw new Error('Open a project in Ruijie Cloud first.');
  if (current === projectName) return false;

  const selected = await page.evaluate(name => {
    const store = window.vm_maccadmin?.$store;
    const projects = Object.values(store?.state?.Group?.groupMap || {}).filter(group => group?.type === 'BUILDING');
    const matches = projects.filter(project => project.name === name);
    if (matches.length === 1) store.commit('Group/SET_GROUPID', matches[0].groupId);
    return { matches: matches.length, names: projects.map(project => project.name) };
  }, projectName);
  if (selected.matches !== 1) throw new Error(`Could not uniquely find the project: ${projectName}. Available: ${selected.names.join(', ') || 'none'}`);

  for (let attempt = 0; attempt < 30; attempt++) {
    if (await currentName() === projectName) return true;
    await page.sleep(0.5);
  }
  throw new Error(`Could not switch to the project: ${projectName}`);
}
