import { intro, log, outro, spinner } from '@clack/prompts';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { modCreate } from './mod-create';
import { parseArgs, promptUser } from './prompts';
import { scaffold } from './scaffold';

// Route subcommands: `create-treenity mod create <name>`
const sub = process.argv[2];
if (sub === 'mod') {
  const action = process.argv[3];
  if (action !== 'create') {
    log.error(`Unknown mod action "${action}". Usage: create-treenity mod create <name>`);
    process.exit(1);
  }
  const yes = process.argv.includes('-y') || process.argv.includes('--yes');
  const rest = process.argv.slice(4).filter(a => !a.startsWith('-'));
  intro('create-treenity mod');
  await modCreate(rest, yes);
  outro('Done!');
  process.exit(0);
}

// Default: project scaffolding
const { name: rawName, yes, template } = parseArgs(process.argv)
const name = rawName ? basename(rawName) : undefined

if (!yes) intro('create-treenity')

const choices = await promptUser(name, yes, template)
const targetDir = rawName ? resolve(rawName) : resolve(choices.projectName)

if (existsSync(targetDir)) {
  log.error(`Directory "${choices.projectName}" already exists.`)
  process.exit(1)
}

const s = yes ? null : spinner()
s?.start('Scaffolding project...')
scaffold(targetDir, choices)
if (s) s.stop('Project created.')
else console.log('Project created.')

// Detect package manager
const ua = process.env.npm_config_user_agent ?? ''
const pm = ua.startsWith('bun') ? 'bun' : ua.startsWith('pnpm') ? 'pnpm' : 'npm'

s?.start('Installing dependencies...')
try {
  execSync(`${pm} install`, { cwd: targetDir, stdio: 'ignore' })
  if (s) s.stop('Dependencies installed.')
  else console.log('Dependencies installed.')
} catch {
  const msg = 'Could not install dependencies. Run `npm install` manually.'
  if (s) s.stop(msg)
  else console.log(msg)
}

const runCmd = pm === 'npm' ? 'npm run' : pm
const next = `cd ${choices.projectName}\n  ${runCmd} dev`

if (!yes) outro(`Done! Next steps:\n\n  ${next}`)
else console.log(`Done!\n  ${next}`)
