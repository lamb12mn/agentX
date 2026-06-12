import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(process.env.AGENTX_HOME || os.homedir(), '.agentx');
const REMOTES_FILE = path.join(CONFIG_DIR, 'remotes.json');

if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });

/**
 * Configuration for a remote server connection
 */
export interface RemoteConfig {
    name: string;
    url: string;      // base URL, e.g. http://localhost:3001
    apiKey?: string;
}

/**
 * Load all configured remote servers from disk
 * @returns Array of remote configurations
 */
export function loadRemotes(): RemoteConfig[] {
    if (!fs.existsSync(REMOTES_FILE)) return [];
    const data = fs.readFileSync(REMOTES_FILE, 'utf8');
    return JSON.parse(data);
}

/**
 * Save remote configurations to disk
 * @param remotes - Array of remote configurations to save
 */
export function saveRemotes(remotes: RemoteConfig[]): void {
    fs.writeFileSync(REMOTES_FILE, JSON.stringify(remotes, null, 2), 'utf8');
}

/**
 * Add a new remote server configuration
 * @param remote - Remote configuration to add
 * @throws Error if remote with same name already exists
 */
export function addRemote(remote: RemoteConfig): void {
    const remotes = loadRemotes();
    if (remotes.some(r => r.name === remote.name)) {
        throw new Error(`Remote '${remote.name}' already exists.`);
    }
    remotes.push(remote);
    saveRemotes(remotes);
}

/**
 * Remove a remote server configuration by name
 * @param name - Name of the remote to remove
 * @throws Error if remote not found
 */
export function removeRemote(name: string): void {
    const remotes = loadRemotes();
    const filtered = remotes.filter(r => r.name !== name);
    if (filtered.length === remotes.length) {
        throw new Error(`Remote '${name}' not found.`);
    }
    saveRemotes(filtered);
}

/**
 * Get a remote server configuration by name
 * @param name - Name of the remote to retrieve
 * @returns The remote configuration, or undefined if not found
 */
export function getRemote(name: string): RemoteConfig | undefined {
    return loadRemotes().find(r => r.name === name);
}
