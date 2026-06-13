import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { listAssets } from '../store/assets.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3001;

app.use(express.static(__dirname));

app.get('/api/assets', async (req, res) => {
    try {
        const assets = await listAssets(req.query.type as any);
        res.json(assets);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

app.listen(port, () => {
    console.log(`AgentX dashboard running at http://localhost:${port}`);
});
