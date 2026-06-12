import axios from 'axios';
import { RemoteConfig } from './config.js';

/**
 * Fetch all assets from a remote server
 * @param remote - Remote server configuration
 * @returns Array of assets from the remote
 */
export async function fetchAssets(remote: RemoteConfig): Promise<any[]> {
    const response = await axios.get(`${remote.url}/api/assets`, {
        headers: remote.apiKey ? { 'X-API-Key': remote.apiKey } : {}
    });
    return response.data;
}

/**
 * Fetch a single asset from a remote server
 * @param remote - Remote server configuration
 * @param assetId - ID of the asset to fetch
 * @returns The asset data
 */
export async function fetchAsset(remote: RemoteConfig, assetId: string): Promise<any> {
    const response = await axios.get(`${remote.url}/api/assets/${assetId}`, {
        headers: remote.apiKey ? { 'X-API-Key': remote.apiKey } : {}
    });
    return response.data;
}

/**
 * Push an asset to a remote server
 * @param remote - Remote server configuration
 * @param asset - Asset data to push
 * @returns Response from the remote server
 */
export async function pushAsset(remote: RemoteConfig, asset: any): Promise<any> {
    const response = await axios.post(`${remote.url}/api/assets`, asset, {
        headers: { 'Content-Type': 'application/json', ...(remote.apiKey ? { 'X-API-Key': remote.apiKey } : {}) }
    });
    return response.data;
}
