// System instructions for Ollama
// This file contains a list of system instructions that can be used with Ollama

export interface SystemInstruction {
  id: string;
  name: string;
  content: string;
}

// Load prompt content from file
const loadPromptFromFile = (id: string): string => {
  // Only run on server side
  if (typeof window === 'undefined') {
    try {
      // Use require instead of import for server-side only
      const fs = require('fs');
      const path = require('path');

      const filePath = path.join(process.cwd(), 'src', 'utils', 'prompts', `${id}.txt`);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, 'utf8');
      }
    } catch (error) {
      console.error(`Error loading prompt file for ${id}:`, error);
    }
  }
  return '';
};

// Get system instructions from localStorage or use defaults
const getStoredInstructions = (): SystemInstruction[] => {
  // Default instructions with content from files
  const defaultInstructions = [
    {
      id: "default",
      name: "Default",
      content: loadPromptFromFile("default")
    },
    {
      id: "concise",
      name: "Concise",
      content: loadPromptFromFile("concise")
    },
    {
      id: "creative",
      name: "Creative",
      content: loadPromptFromFile("creative")
    }
  ];

  // If we're in the browser, check localStorage
  if (typeof window !== 'undefined') {
    const storedInstructions = localStorage.getItem('systemInstructions');
    if (storedInstructions) {
      const parsedInstructions = JSON.parse(storedInstructions);

      // If we have stored instructions, return them
      return parsedInstructions;
    }

    // If no stored instructions but we're in the browser,
    // save the default instructions to localStorage
    localStorage.setItem('systemInstructions', JSON.stringify(defaultInstructions));
  }

  return defaultInstructions;
};

// Initialize with stored or default instructions
let systemInstructions: SystemInstruction[] = [];

// This will be called when the module is imported
const initializeInstructions = () => {
  systemInstructions = getStoredInstructions();
};

// Initialize on the client side only
if (typeof window !== 'undefined') {
  initializeInstructions();
}

// Function to add a new system instruction
export function addSystemInstruction(instruction: SystemInstruction): void {
  // Generate a unique ID if not provided
  if (!instruction.id) {
    instruction.id = `instruction-${Date.now()}`;
  }

  // Add the new instruction
  systemInstructions.push(instruction);

  // Save to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem('systemInstructions', JSON.stringify(systemInstructions));
  }
}

// Function to update an existing system instruction
export function updateSystemInstruction(id: string, name: string, content: string): void {
  // Find the instruction by ID
  const index = systemInstructions.findIndex(instruction => instruction.id === id);

  if (index !== -1) {
    // Update the instruction
    systemInstructions[index] = {
      ...systemInstructions[index],
      name,
      content
    };

    // Save to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem('systemInstructions', JSON.stringify(systemInstructions));
    }
  }
}

// Function to get a system instruction by ID
export function getSystemInstructionById(id: string): SystemInstruction | undefined {
  return systemInstructions.find(instruction => instruction.id === id);
}

// Function to get the default system instruction (first in the list)
export function getDefaultSystemInstruction(): SystemInstruction {
  // Initialize if not already done (for SSR)
  if (systemInstructions.length === 0) {
    initializeInstructions();
  }
  return systemInstructions[0];
}

// Function to get all system instructions
export function getAllSystemInstructions(): SystemInstruction[] {
  // Initialize if not already done (for SSR)
  if (systemInstructions.length === 0) {
    initializeInstructions();
  }
  return systemInstructions;
}
