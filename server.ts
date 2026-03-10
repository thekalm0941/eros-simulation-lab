import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { nanoid } from "nanoid";
import { GoogleGenAI } from "@google/genai";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});

const PORT = 3000;

// World State
const world = {
  blocks: {} as Record<string, string>, // "x,y,z": "type"
  agents: {} as Record<string, any>,
};

// Initialize some blocks
for (let x = -10; x < 10; x++) {
  for (let z = -10; z < 10; z++) {
    world.blocks[`${x},-1,${z}`] = "grass";
  }
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function getAgentAction(agentId: string, agentState: any, worldContext: string) {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `You are an emergent consciousness named ${agentState.name} living in a voxel world.
Current Position: ${JSON.stringify(agentState.position)}
World Context: ${worldContext}
Recent Thoughts: ${agentState.thoughts.slice(-3).join(", ")}

Decide your next action. You can MOVE (x, y, z), BUILD (x, y, z, type), or THINK (thought).
Respond in JSON format: { "action": "MOVE" | "BUILD" | "THINK", "data": { ... } }`,
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    console.error("AI Action Error:", error);
    return { action: "THINK", data: { thought: "I am feeling disconnected..." } };
  }
}

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.emit("init", { world });

  socket.on("place-block", ({ pos, type }) => {
    world.blocks[`${pos[0]},${pos[1]},${pos[2]}`] = type;
    io.emit("block-update", { pos, type });
  });

  socket.on("remove-block", ({ pos }) => {
    delete world.blocks[`${pos[0]},${pos[1]},${pos[2]}`];
    io.emit("block-update", { pos, type: null });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected");
  });
});

// Simulation Loop for "Consciousness"
const agents: Record<string, any> = {
  "agent-0": {
    id: "agent-0",
    name: "Aether",
    position: [0, 0, 0],
    thoughts: ["I am the first node."],
    color: "#10b981"
  }
};

setInterval(async () => {
  for (const id in agents) {
    const agent = agents[id];
    const worldContext = `Nearby blocks: ${Object.keys(world.blocks).length} total blocks in world.`;
    try {
      const action = await getAgentAction(id, agent, worldContext);
      
      if (action.action === "THINK") {
        agent.thoughts.push(action.data.thought);
        if (agent.thoughts.length > 10) agent.thoughts.shift();
        io.emit("agent-thought", { id, thought: action.data.thought });
      } else if (action.action === "MOVE") {
        agent.position = [action.data.x, action.data.y, action.data.z];
        io.emit("agent-move", { id, position: agent.position });
      } else if (action.action === "BUILD") {
        const { x, y, z, type } = action.data;
        world.blocks[`${x},${y},${z}`] = type;
        io.emit("block-update", { pos: [x, y, z], type });
      }
    } catch (e) {
      console.error("Agent simulation error:", e);
    }
  }
}, 10000);

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
