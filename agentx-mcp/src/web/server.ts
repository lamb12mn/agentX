import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = process.env.PORT || 3001;

app.use(express.static(__dirname));

// Mock API - 实际可调用 listAssets
app.get('/api/assets', async (req, res) => {
    // 这里可以改为真实的 listAssets 调用
    res.json([
        { id: 'example-asset-1', type: 'skill' },
        { id: 'example-asset-2', type: 'agent' }
    ]);
});

app.listen(port, () => {
    console.log(`AgentX dashboard running at http://localhost:${port}`);
});
