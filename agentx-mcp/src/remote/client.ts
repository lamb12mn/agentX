import axios from 'axios';
import { RemoteConfig } from './config.js';

export async function fetchAssets(remote: RemoteConfig): Promise<any[]> {
    const response = await axios.get(`${remote.url}/api/assets`, {
        headers: remote.apiKey ? { 'X-API-Key': remote.apiKey } : {}
    });
    return response.data;
}

export async function fetchAsset(remote: RemoteConfig, assetId: string): Promise<any> {
    const response = await axios.get(`${remote.url}/api/assets/${assetId}`, {
        headers: remote.apiKey ? { 'X-API-Key': remote.apiKey } : {}
    });
    return response.data;
}

export async function pushAsset(remote: RemoteConfig, asset: any): Promise<any> {
    const response = await axios.post(`${remote.url}/api/assets`, asset, {
        headers: { 'Content-Type': 'application/json', ...(remote.apiKey ? { 'X-API-Key': remote.apiKey } : {}) }
    });
    return response.data;
}
