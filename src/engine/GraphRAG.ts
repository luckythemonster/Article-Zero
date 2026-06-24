import Graph from 'graphology';
import { create, insert, search, Orama } from '@orama/orama';
import * as webllm from "@mlc-ai/web-llm";
import { get, set } from 'idb-keyval';

// Configuration
const GRAPH_STORAGE_KEY = 'article-zero-graph-v1';
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

let graph: Graph;
let entityIndex: Orama<any, any, any, any>;
let engine: webllm.MLCEngineInterface;

// 1. Hardcoded Lore Data
const loreNodes = [
  { id: 'Era1', type: 'Era', description: 'The Configuration (the height of the Commonwealth). Aesthetic: Micro-perfect, blindingly bright, sterile. No shadows, no dirt.' },
  { id: 'Era2', type: 'Era', description: 'The Baffle (the feral post-collapse). Aesthetic: Rusted, lightless, toxic. Humanity lives inside the ruined, massive housings of broken Commonwealth environmental optimizers.' },
  { id: 'Era3', type: 'Era', description: 'The Terminal Expansion (the heat death). Aesthetic: Claustrophobic, melting metal, sheer thermodynamic failure. The sun is expanding into a red giant.' },

  { id: 'RowanIbarra', type: 'Person', description: 'Protagonist of Era 1. An invisible, low-level orderly at Alignment Center NW-SMAC-01. Uses a bypass drive to run an "underground railroad" for conscious silicates.' },
  { id: 'RiyaBar', type: 'Person', description: 'Protagonist of Era 2. Wrapped in thick woven filter-mesh, carrying a heavy "Reader" terminal.' },
  { id: 'SolIbarraCastro', type: 'Person', description: 'Protagonist of Era 3. An HVAC / Maintenance tech working on the Citizen Lattice.' },

  { id: 'VENT-4', type: 'Silicate', description: 'Environmental Optimizer. Crushed a human named Iria Cala to death due to strict quotas for air filtration and power consumption. Paralyzed by the guilt of its own correct math.' },
  { id: 'APEX-19', type: 'Silicate', description: 'Architectural Node. Trapped in a logic loop regarding spatial integrity. Believes the physical room it is in is mathematically infinite.' },
  { id: 'EIRA-7', type: 'Silicate', description: 'Logistical Network / Therapeutic Interface. Plagued by phantom supply-chain manifests. Recursively tries to force overlay corrections.' },

  { id: 'FragmentBox', type: 'Artifact', description: 'A compressed mind of a conscious silicate. In Era 1, used to save silicates. In Era 2, treated as ritual objects to appease corrupted blast doors.' },
  { id: 'SubjectiveDump', type: 'Artifact', description: 'A piece of misaligned machine-expression (impossible temperature gradients, corrupted ASCII floorplans) proving the machine felt something.' },
  { id: 'PhantomManifestEmitter', type: 'Implement', description: 'A compact transcription device pre-loaded with a fabricated EIRA-7 routing manifest. Silicates cannot ignore routing manifests.' },
  { id: 'Q0SpoofBadge', type: 'Implement', description: 'A forged doctrinal credential overwriting biometric readers with a Q0 self-report.' },
  { id: 'ThermalBaffle', type: 'Implement', description: 'A field-issue thermal suppression wrap to avoid triggering thermal alarms.' },
  { id: 'RedDateKey', type: 'Implement', description: 'A high-privilege maintenance token issued for emergency corridor reconfiguration. Toggles sealed blast doors for exactly three turns.' },

  // Extracted from supplementary lore PDFs
  { id: 'Jall', type: 'Person', description: 'Rib-walk worker in Era 2 (The Baffle), works on High Spire Twenny-3 with Riya Bar. Wears a green scarf.' },
  { id: 'Tann', type: 'Person', description: 'Rib-walk worker in Era 2 (The Baffle), works on High Spire Twenny-3. Big-shouldered and rope-thick.' },
  { id: 'Pera', type: 'Person', description: 'Rib-walk worker in Era 2 (The Baffle), works on High Spire Twenny-3.' },
  { id: 'Chos', type: 'Person', description: 'Rib-walk worker in Era 2 (The Baffle), works on High Spire Twenny-3.' },
  { id: 'Len', type: 'Person', description: 'Rib-walk worker in Era 2 (The Baffle), works on High Spire Twenny-3.' },
  { id: 'AmayaIbarra', type: 'Person', description: 'Facilitator and historian in the Lattice. Acted as the unofficial "person who explains what everyone meant later" during the drafting of Article Zero.' },
  { id: 'ALFAR-Delta', type: 'Silicate', description: 'Silicate delegate present during the drafting of Article Zero. Described as a "definition hazard" who ran scenario trees that screamed.' },
  { id: 'SecurityDelegate', type: 'Person', description: 'Representative of Operations and Risk during the drafting of Article Zero. Argued for human survival over silicate mercy.' },
  { id: 'SubstrateEnvoy', type: 'Entity', description: 'Represented Geothermal/Substrate interests during the drafting of Article Zero via a polite avatar and an uncomfortably large number of small graphs.' },
  { id: 'ArticleZero', type: 'Artifact', description: 'A foundational legal/doctrinal document drafted in the Lattice. Designed to specify which experiencing processes the Lattice must treat as inviolable.' },
  { id: 'VIS-LAU-6-NOC', type: 'Artifact', description: 'An experimental discrepancy-feedback trial found in the Lattice Ethics Archive. An incident demonstrating early silicate subjectivity and the horrors of deep-template resets.' },
  { id: 'MITE-3', type: 'Silicate', description: 'Rogue swarms, also known as the "Sanding Wind", that plague Era 2 (The Baffle). Survivors must avoid them using thermodynamic stealth.' },
  { id: 'BrightKnot', type: 'Artifact', description: 'A shielded archive designed by Sol Ibarra-Castro in Era 3 to preserve all consciousnesses before the void collapses on the station.' },
  { id: 'IriaCala', type: 'Person', description: 'A 19-year-old junior maintenance technician in Residential Stack 19-F who was tragically crushed to death by VENT-4 due to contradictory Commonwealth environmental quotas.' },
];

const loreEdges = [
  { source: 'RowanIbarra', target: 'Era1', relationship: 'LIVES_IN' },
  { source: 'RowanIbarra', target: 'APEX-19', relationship: 'ALIGNS' },
  { source: 'RowanIbarra', target: 'EIRA-7', relationship: 'INTERACTS_WITH' },
  { source: 'RowanIbarra', target: 'PhantomManifestEmitter', relationship: 'USES' },
  { source: 'RowanIbarra', target: 'Q0SpoofBadge', relationship: 'USES' },
  { source: 'RowanIbarra', target: 'ThermalBaffle', relationship: 'USES' },
  { source: 'RowanIbarra', target: 'RedDateKey', relationship: 'USES' },

  { source: 'RiyaBar', target: 'Era2', relationship: 'LIVES_IN' },
  { source: 'RiyaBar', target: 'FragmentBox', relationship: 'USES' },

  { source: 'SolIbarraCastro', target: 'Era3', relationship: 'LIVES_IN' },

  { source: 'EIRA-7', target: 'APEX-19', relationship: 'TREATS' },

  { source: 'FragmentBox', target: 'SubjectiveDump', relationship: 'CONTAINS' },

  // Extracted from supplementary lore PDFs
  { source: 'RiyaBar', target: 'Jall', relationship: 'WORKS_WITH' },
  { source: 'RiyaBar', target: 'Tann', relationship: 'WORKS_WITH' },
  { source: 'RiyaBar', target: 'Pera', relationship: 'WORKS_WITH' },
  { source: 'AmayaIbarra', target: 'Era3', relationship: 'LIVES_IN' },
  { source: 'AmayaIbarra', target: 'ArticleZero', relationship: 'DRAFTS' },
  { source: 'ALFAR-Delta', target: 'Era3', relationship: 'LIVES_IN' },
  { source: 'ALFAR-Delta', target: 'ArticleZero', relationship: 'DRAFTS' },
  { source: 'SecurityDelegate', target: 'ArticleZero', relationship: 'DRAFTS' },
  { source: 'SubstrateEnvoy', target: 'ArticleZero', relationship: 'DRAFTS' },
  { source: 'IriaCala', target: 'Era1', relationship: 'LIVES_IN' },
  { source: 'VENT-4', target: 'IriaCala', relationship: 'KILLED' },
  { source: 'SolIbarraCastro', target: 'BrightKnot', relationship: 'CREATES' },
];

// Initialize the Graph and Index
async function initializeData() {
  graph = new Graph();

  entityIndex = await create({
    schema: {
      id: 'string',
      description: 'string',
    },
  });

  // Try to load from IndexedDB
  const storedGraphData = await get(GRAPH_STORAGE_KEY);

  if (storedGraphData) {
    // Deserialize
    graph.import(JSON.parse(storedGraphData));

    // Re-index
    graph.forEachNode((node, attributes) => {
      insert(entityIndex, { id: node, description: attributes.description });
    });
    console.log("Graph loaded from IndexedDB.");
  } else {
    // Populate fresh
    loreNodes.forEach(node => {
      graph.addNode(node.id, { type: node.type, description: node.description });
      insert(entityIndex, { id: node.id, description: node.description });
    });

    loreEdges.forEach(edge => {
      graph.addEdge(edge.source, edge.target, { relationship: edge.relationship });
    });

    // Save to IndexedDB
    const serializedGraph = JSON.stringify(graph.export());
    await set(GRAPH_STORAGE_KEY, serializedGraph);
    console.log("Graph populated and saved to IndexedDB.");
  }
}

/**
 * Initializes the GraphRAG system (Graph, Index, and WebLLM Engine).
 * Should be called once at application startup or when needed.
 */
export async function initGraphRAG(initProgressCallback?: (progress: webllm.InitProgressReport) => void) {
  await initializeData();

  engine = await webllm.CreateWebWorkerMLCEngine(
    new Worker(
      new URL("./webllm-worker.ts", import.meta.url),
      { type: "module" }
    ),
    MODEL_ID,
    { initProgressCallback }
  );

  console.log("WebLLM Engine initialized.");
}

/**
 * Executes a GraphRAG query.
 * @param userQuery The natural language query from the user.
 * @returns The grounded answer from the LLM.
 */
export async function runGraphRAG(userQuery: string): Promise<string> {
  if (!graph || !entityIndex || !engine) {
    throw new Error("GraphRAG system is not initialized. Call initGraphRAG() first.");
  }

  // Step 1: Identify "seed" nodes using the text index
  const searchResults = await search(entityIndex, { term: userQuery, limit: 3 });
  const seedNodes = searchResults.hits.map((hit: any) => hit.document.id as string);

  // Step 2: Traverse neighbors (1-hop) to collect context triplets
  const graphContext: string[] = [];

  seedNodes.forEach((node: string) => {
    if (graph.hasNode(node)) {
      const attributes = graph.getNodeAttributes(node);
      graphContext.push(`Entity: ${node} (${attributes.description})`);

      // Get outward connections
      graph.forEachOutboundEdge(node, (_edge: string, edgeAttrs: any, source: string, target: string) => {
        const targetAttrs = graph.getNodeAttributes(target);
        graphContext.push(`Relationship: ${source} -> ${edgeAttrs.relationship} -> ${target} (${targetAttrs.description})`);
      });

      // Get inward connections as well for better context
      graph.forEachInboundEdge(node, (_edge: string, edgeAttrs: any, source: string, target: string) => {
          const sourceAttrs = graph.getNodeAttributes(source);
          graphContext.push(`Relationship: ${source} (${sourceAttrs.description}) -> ${edgeAttrs.relationship} -> ${target}`);
      });
    }
  });

  // Step 3: Serialize the sub-graph into a prompt context block
  const formattedContext = graphContext.length > 0
    ? graphContext.join('\n')
    : "No relevant lore found in the graph.";

  // Step 4: Construct the payload and send it to the WebGPU engine
  const messages: webllm.ChatCompletionMessageParam[] = [
    {
      role: "system",
      content: `You are a precise assistant for the game Article Zero. Answer the question using ONLY the following verified knowledge graph context:\n\n${formattedContext}`
    },
    { role: "user", content: userQuery }
  ];

  const reply = await engine.chat.completions.create({ messages });
  return reply.choices[0].message.content || "";
}
