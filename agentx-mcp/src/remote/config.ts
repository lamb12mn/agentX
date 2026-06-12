import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(process.env.AGENTX_HOME || os.homedir(), '.agentx');
const REMOTES_FILE = path.join(CONFIG_DIR, 'remotes.json');

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

export interface RemoteConfig {
    name: string;
    url: string;      // base URL, e.g. http://localhost:3001
    apiKey?: string;
}

export function loadRemotes(): RemoteConfig[] {
    if (!fs.existsSync(REMOTES_FILE)) return [];
    const data = fs.readFileSync(REMOTES_FILE, 'utf8');
    return JSON.parse(data);
}

export function saveRemotes(remotes: RemoteConfig[]): void {
    fs.writeFileSync(REMOTES_FILE, JSON.stringify(remotes, null, 2), 'utf8');
}

export function addRemote(remote: RemoteConfig): void {
    const remotes = loadRemotes();
    if (remotes.some(r => r.name === remote.name)) {
        throw new Error(`Remote '${remote.name}' already exists.`);
    }
    remotes.push(remote);
    saveRemotes(remotes);
}

export function removeRemote(name: string): void {
    const remotes = loadRemotes();
    const filtered = remotes.filter(r => r.name !== name);
    if (filtered.length === remotes.length) {
        throw new Error(`Remote '${name}' not found.`);
    }
    saveRemotes(filtered);
}

export function getRemote(name: string): RemoteConfig | undefined {
    return loadRemotes().find(r => r.name === name);
}
