"use client";
import AppNavbar from "@/components/app-navbar";
import CommandMenu from "@/components/command-menu";
import CommandTextInput from "@/components/command-text-input";
import ExpandingTextInput from "@/components/expanding-text-input";
import { CopyIcon } from "@/components/icons/copy-icon";
import { RefreshIcon } from "@/components/icons/refresh-icon";
import { SaveIcon } from "@/components/icons/save-icon";
import { TrashIcon } from "@/components/icons/trash-icon";
import Sidebar from "@/components/sidebar";
import { cn } from "@/utils/cn";
import { baseUrl, fallbackModel, vectorSearchBaseUrl } from "@/utils/constants";
import generateRandomString from "@/utils/generateRandomString";
import { useCycle } from "framer-motion";
import { ChatOllama } from "langchain/chat_models/ollama";
import { AIMessage, HumanMessage, SystemMessage } from "langchain/schema";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AppModal, useModal } from "./context/ModalContext";
import { usePrompts } from "./context/PromptContext";
import { useSystemInstruction } from "./context/SystemInstructionContext";
import { getSystemInstructionById } from "@/utils/systemInstructions";

// Define the DocumentEntry type
type DocumentEntry = {
  filename: string;
  guid: string;
  selected?: boolean;
};

export default function Home() {
  const { setModalConfig } = useModal();
  const { activePromptTemplate, setActivePromptTemplate } = usePrompts();
  const { activeSystemInstruction } = useSystemInstruction();
  const [newPrompt, setNewPrompt] = useState("");
  const [messages, setMessages] = useState<
    {
      type: string;
      id: any;
      timestamp: number;
      content: string;
      model?: string;
    }[]
  >([]);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [activeModel, setActiveModel] = useState<string>("");
  const [ollama, setOllama] = useState<ChatOllama>();
  const [conversations, setConversations] = useState<{ title: string; filePath: string }[]>([]);
  const [activeConversation, setActiveConversation] = useState<string>("");
  const [menuState, toggleMenuState] = useCycle(false, true);
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentEntry[]>([]);
  const msgContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollToBottom();
  }, [activeConversation]);

  useEffect(() => {
    // Get the initial model
    getInitialModel();

    // Get existing conversations
    getExistingConvos();

    // Set up window.setDocumentValues function
    setupWindowDocumentValues();
  }, []);

  // Function to handle document values from vector search
  function setupWindowDocumentValues() {
    // @ts-ignore
    window.setDocumentValues = (documents: DocumentEntry[] | DocumentEntry | string, guid?: string) => {
      console.log('window.setDocumentValues called with:', documents);

      if (typeof documents === 'string' && guid) {
        // Legacy support: single document with filename and guid
        const newEntry: DocumentEntry = {
          filename: documents,
          guid: guid,
          selected: true
        };
        setSelectedDocuments(prevDocs => {
          const exists = prevDocs.some(doc => doc.guid === guid);
          if (!exists) {
            return [...prevDocs, newEntry];
          }
          return prevDocs;
        });
      } else if (Array.isArray(documents)) {
        // New format: array of DocumentEntry objects
        setSelectedDocuments(prevDocs => {
          const existingGuids = new Set(prevDocs.map(doc => doc.guid));
          const newDocs = documents.filter(doc => !existingGuids.has(doc.guid));
          return [...prevDocs, ...newDocs];
        });
      } else if (typeof documents === 'object') {
        // Single DocumentEntry object
        const doc = documents as DocumentEntry;
        setSelectedDocuments(prevDocs => {
          const exists = prevDocs.some(d => d.guid === doc.guid);
          if (!exists) {
            return [...prevDocs, { ...doc, selected: true }];
          }
          return prevDocs;
        });
      }
    };

    return () => {
      // @ts-ignore
      delete window.setDocumentValues;
    };
  }

  function getInitialModel() {
    fetch(`${baseUrl}/api/tags`)
      .then((response) => response.json())
      .then((data) => {
        setAvailableModels(data.models);

        const storedModel = localStorage.getItem("initialLocalLM");
        if (
          storedModel &&
          storedModel !== "" &&
          data.models.findIndex(
            (m: { name: string }) =>
              m.name.toLowerCase() === storedModel.toLowerCase(),
          ) > -1
        ) {
          setActiveModel(storedModel);
          const newOllama = new ChatOllama({
            baseUrl: baseUrl,
            model: storedModel,
          });
          setOllama(newOllama);
        } else {
          setActiveModel(data.models[0]?.name);
          const initOllama = new ChatOllama({
            baseUrl: baseUrl,
            model: data.models[0]?.name,
          });
          setOllama(initOllama);
        }
      });
  }

  async function getExistingConvos() {
    fetch("../api/fs/get-convos", {
      method: "POST",
      body: JSON.stringify({
        conversationPath: "./conversations",
      }),
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
      },
    }).then((response) => {
      response.json().then((data) => setConversations(data));
    });
  }

  async function performVectorSearch(query: string) {
    try {
      const selectedDocs = selectedDocuments.filter(doc => doc.selected);

      let response;

      if (selectedDocs.length > 0) {
        const document_guids = selectedDocs.map(doc => doc.guid);

        response = await fetch(`${vectorSearchBaseUrl}/v1.0/vector/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            query: query,
            document_guids: document_guids,
            limit: 10
          })
        });
      } else {
        response = await fetch(`${vectorSearchBaseUrl}/v1.0/vector/router/search`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            query: query,
            document_guid: "f49f92f7-8cdf-4f44-b327-0519e2aad881",
            limit: 1
          })
        });
      }

      if (!response.ok) {
        console.error('Vector search failed:', response.statusText);
        return null;
      }

      const data = await response.json();
      return data.results;
    } catch (error) {
      console.error('Error performing vector search:', error);
      return null;
    }
  }

  async function triggerPrompt(input: string = newPrompt) {

    if (!ollama) {
      console.error("Ollama is not initialized!");
      return;
    }

    scrollToBottom();

    if (messages.length === 0) {
      console.log("First message, getting name...");
      getName(input);
    }

    const msg = {
      type: "human",
      id: generateRandomString(8),
      timestamp: Date.now(),
      content: input,
    };

    console.log("Creating message:", msg);

    const model = activeModel;
    let streamedText = "";

    const msgCache = [...messages, msg];
    setMessages(msgCache);

    // First perform vector search
    const vectorSearchResults = await performVectorSearch(input);

    // Prepare context from vector search results
    let contextFromVectorSearch = "";
    if (vectorSearchResults && vectorSearchResults.length > 0) {
      if (window.setDocumentValues) {
        const documentEntries: DocumentEntry[] = vectorSearchResults.map((result: any) => ({
          filename: decodeURIComponent(result.object_key),
          guid: result.document_guid,
          selected: true
        }));

        window.setDocumentValues(documentEntries);
      }

      contextFromVectorSearch = "Context from vector search:\n" +
        vectorSearchResults.map((result: any) => result.content).join("\n") +
        "\n\nUser query: " + input;
    } else {
      contextFromVectorSearch = input;
    }

    // Use the context in the request to Ollama
    const selectedDocs = selectedDocuments.filter(doc => doc.selected);
    const systemInstruction = selectedDocs.length === 0
      ? getSystemInstructionById("concise") || activeSystemInstruction
      : activeSystemInstruction;

    console.log(`Using ${systemInstruction.name} system instruction`);

    const messagesWithSystemInstruction = [
      new SystemMessage(systemInstruction.content),
      ...msgCache.map((m, index) => {
        if (index === msgCache.length - 1 && m.type === "human") {
          return new HumanMessage(contextFromVectorSearch);
        } else {
          return m.type === "human"
            ? new HumanMessage(m.content)
            : new AIMessage(m.content);
        }
      })
    ];

    try {
      const stream = await ollama.stream(messagesWithSystemInstruction);

      setNewPrompt("");
      setActivePromptTemplate(undefined);

      let updatedMessages = [...msgCache];
      let c = 0;

      for await (const chunk of stream) {
        streamedText += chunk.content;
        const aiMsg = {
          type: "ai",
          id: generateRandomString(8),
          timestamp: Date.now(),
          content: streamedText,
          model,
        };
        updatedMessages = [...msgCache, aiMsg];
        setMessages(updatedMessages);
        c++;
        if (c % 8 == 0) scrollToBottom();
      }

      scrollToBottom();
      persistConvo(updatedMessages);
    } catch (error) {
      console.error("Error streaming from Ollama:", error);
      // Optionally add an error message to the chat
      const errorMsg = {
        type: "ai",
        id: generateRandomString(8),
        timestamp: Date.now(),
        content: "Sorry, I encountered an error while processing your request. Please try again.",
        model,
      };
      const updatedMessages = [...msgCache, errorMsg];
      setMessages(updatedMessages);
    }
  }

  async function persistConvo(messages: any[]) {
    let name = activeConversation;
    if (name == "") {
      name = (await getName(newPrompt)).trim();
      setActiveConversation(name.trim());
    }

    fetch("../api/fs/persist-convo", {
      method: "POST",
      body: JSON.stringify({
        conversationPath: "./conversations",
        messages: messages,
        convoTitle: name.trim().replaceAll('"', ""),
        filename:
          name
            .toLowerCase()
            .replaceAll(" ", "_")
            .replaceAll(":", "-")
            .replaceAll('"', "") + ".json",
      }),
    }).then(() => getExistingConvos());
  }

  function deleteMessage(activeMsg: {
    type: string;
    id: any;
    timestamp: number;
    content: string;
    model?: string;
  }) {
    let filtered = messages.filter((m, i) => m.id != activeMsg.id);
    setMessages(() => filtered);
    persistConvo(filtered);
  }

  async function refreshMessage(activeMsg: {
    type: string;
    id: any;
    timestamp: number;
    content: string;
    model?: string;
  }) {
    if (!ollama) return;
    let index =
      messages.findIndex((m) => m.id == activeMsg.id) -
      (activeMsg.type == "human" ? 0 : 1);
    let filtered = messages.filter((m, i) => index >= i);

    setMessages(() => filtered);

    const model = activeModel;
    let streamedText = "";
    const msgCache = [...filtered];

    const lastHumanMessage = filtered.filter(m => m.type === "human").pop();
    let vectorSearchResults: any[] | null = null;

    if (lastHumanMessage) {
      vectorSearchResults = await performVectorSearch(lastHumanMessage.content);

      if (vectorSearchResults && vectorSearchResults.length > 0 && window.setDocumentValues) {
        const documentEntries: DocumentEntry[] = vectorSearchResults.map((result: any) => ({
          filename: decodeURIComponent(result.object_key),
          guid: result.document_guid,
          selected: true
        }));

        window.setDocumentValues(documentEntries);
      }
    }

    const selectedDocs = selectedDocuments.filter(doc => doc.selected);
    const systemInstruction = selectedDocs.length === 0
      ? getSystemInstructionById("concise") || activeSystemInstruction
      : activeSystemInstruction;

    const messagesForOllama = [
      new SystemMessage(systemInstruction.content),
      ...filtered.map((m, index) => {
        if (index === filtered.length - 1 && m.type === "human" && vectorSearchResults && vectorSearchResults.length > 0) {
          const contextFromVectorSearch = "Context from vector search:\n" +
            vectorSearchResults.map((result: any) => result.content).join("\n") +
            "\n\nUser query: " + m.content;
          return new HumanMessage(contextFromVectorSearch);
        } else {
          return m.type === "human"
            ? new HumanMessage(m.content)
            : new AIMessage(m.content);
        }
      })
    ];

    const stream = await ollama.stream(messagesForOllama);
    setNewPrompt("");
    let updatedMessages = [...msgCache];
    let c = 0;
    for await (const chunk of stream) {
      streamedText += chunk.content;
      const aiMsg = {
        type: "ai",
        id: generateRandomString(8),
        timestamp: Date.now(),
        content: streamedText,
        model,
      };
      updatedMessages = [...msgCache, aiMsg];
      setMessages(() => updatedMessages);
      c++;
      if (c % 8 == 0) scrollToBottom();
    }

    scrollToBottom();
    persistConvo(updatedMessages);
  }

  const scrollToBottom = () => {
    if (msgContainerRef.current) {
      msgContainerRef.current.scrollTo({
        top: msgContainerRef.current.scrollHeight + 10000,
        behavior: "smooth",
      });
    }
  };

  function getName(input: string) {
    const nameOllama = new ChatOllama({
      baseUrl: baseUrl,
      model: activeModel && activeModel.trim() !== "" ? activeModel : fallbackModel,
      verbose: false,
    });
    return nameOllama!
      .predict(
        "You're a tool, that receives an input and responds exclusively with a 2-5 word summary of the topic for the HPE Partner Portal (and absolutely no prose) based specifically on the words used in the input (not the expected output). Each word in the summary should be carefully chosen so that it's perfectly informative - and serve as a perfect title for the input. Now, return the summary for the following input:\n" +
        input,
      )
      .then((name) => name);
  }

  return (
    <main className="relative flex h-screen w-screen items-stretch overflow-hidden bg-[#f7f7f7]">
      <Sidebar
        activeConversation={activeConversation}
        conversations={conversations}
        menuState={menuState}
        setActiveConversation={setActiveConversation}
        setConversations={setConversations}
        setMessages={setMessages}
        setNewPrompt={setNewPrompt}
        clearDocuments={() => setSelectedDocuments([])}
        setDocumentEntries={(documents) => {
          if (Array.isArray(documents) && documents.length === 0) {
            setSelectedDocuments([]);
          } else if (typeof documents === 'string' && arguments.length > 1) {
            const guid = arguments[1];
            const newEntry = {
              filename: documents,
              guid: guid,
              selected: true
            };
            setSelectedDocuments([newEntry]);
          } else if (Array.isArray(documents)) {
            setSelectedDocuments(documents);
          } else {
            if (typeof documents === 'string') {
              console.error("Expected DocumentEntry, received string:", documents);
              setSelectedDocuments([]);
            } else {
              setSelectedDocuments([documents]);
            }
          }
        }}
        toggleMenuState={toggleMenuState}
      />
      <div
        className={cn(
          "flex flex-1 flex-col transition-all duration-300 ease-in-out",
          menuState ? "ml-80" : "ml-0"
        )}
      >
        <AppNavbar
          documentName={activeConversation}
          setDocumentName={() => { }}
          activeModel={activeModel}
          availableModels={availableModels}
          setActiveModel={setActiveModel}
          setOllama={setOllama}
          selectedDocuments={selectedDocuments}
          onDocumentToggle={(index: number) => {
            setSelectedDocuments(prevDocs =>
              prevDocs.map((doc, i) =>
                i === index
                  ? { ...doc, selected: !doc.selected }
                  : doc
              )
            );
          }}
        />

        {/* Main content area with documents panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Chat area */}
          <div className="flex-1 overflow-hidden bg-[#f7f7f7]">
            <div className="flex h-full flex-col">
              <div
                ref={msgContainerRef}
                className="flex-1 overflow-y-auto px-4 py-6 md:px-8"
              >
                <div className="mx-auto max-w-4xl">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <div className="text-center">
                        <h2 className="mb-2 text-2xl font-semibold text-gray-700">Welcome to the HPE Partner Portal AI Assistant</h2>
                        <p className="text-gray-500">Start a conversation to begin by telling us what system you're interested in getting some information about.</p>
                        <p className="text-gray-500">That will help the system narrow down the scope and provide the best responses</p>
                        <p className="text-gray-500">You can then select which documents you wish to research from the panel on the right</p>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {messages.map((msg) => (
                        <div
                          key={"message-" + msg.id}
                          className={cn(
                            "group relative flex gap-3",
                            msg.type === "human" ? "justify-end" : "justify-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[70%] rounded-lg px-4 py-3",
                              msg.type === "human"
                                ? "bg-[#01a982] text-white"
                                : "bg-white text-gray-800"
                            )}
                          >
                            <div className="mb-1 flex items-center gap-2">
                              <span className="text-xs opacity-70">
                                {msg?.model?.split(":")[0] || "You"} •{" "}
                                {new Date(msg.timestamp).toLocaleTimeString()}
                              </span>
                            </div>
                            <Markdown
                              remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                              className="prose prose-sm max-w-none"
                            >
                              {msg.content.trim()}
                            </Markdown>
                            <div className="mt-2 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                              {msg.type === "human" && (
                                <SaveIcon
                                  onClick={() => {
                                    setModalConfig({
                                      modal: AppModal.SAVE_PROMPT,
                                      data: msg,
                                    });
                                  }}
                                  className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                                />
                              )}
                              <RefreshIcon
                                onClick={() => refreshMessage(msg)}
                                className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                              />
                              <CopyIcon
                                onClick={() => {
                                  navigator.clipboard.writeText(msg.content);
                                }}
                                className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                              />
                              <TrashIcon
                                onClick={() => {
                                  deleteMessage(msg);
                                }}
                                className="h-4 w-4 cursor-pointer fill-current opacity-60 hover:opacity-100"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border-t bg-white px-4 py-4 md:px-8">
                <div className="mx-auto max-w-4xl">
                  <CommandMenu
                    showMenu={
                      !activePromptTemplate &&
                      !!newPrompt &&
                      newPrompt.startsWith("/") &&
                      newPrompt == "/" + newPrompt.replace(/[^a-zA-Z0-9_]/g, "")
                    }
                    filterString={newPrompt.substring(1)}
                  />
                  <div className="relative">
                    {activePromptTemplate ? (
                      <CommandTextInput
                        onKeyDown={(x) => {
                          if (
                            x.e.key === "Enter" &&
                            !x.e.metaKey &&
                            !x.e.shiftKey &&
                            !x.e.altKey &&
                            newPrompt !== ""
                          ) {
                            triggerPrompt(x.input);
                          }
                        }}
                      />
                    ) : (
                      <ExpandingTextInput
                        onChange={(e: any) => {
                          if (e.target.value != "\n") setNewPrompt(e.target.value);
                        }}
                        onKeyDown={(e) => {
                          if (
                            e.key === "Enter" &&
                            !e.metaKey &&
                            !e.shiftKey &&
                            !e.altKey &&
                            newPrompt !== ""
                          ) {
                            triggerPrompt();
                          }
                        }}
                        value={newPrompt}
                        placeholder="Send a message"
                        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-gray-700 placeholder-gray-500 focus:border-[#01a982] focus:outline-none focus:ring-2 focus:ring-[#01a982] focus:ring-opacity-50"
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Documents Panel - Always visible */}
          <div className="w-80 bg-white shadow-lg border-l border-gray-200 flex flex-col">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
              <p className="text-sm text-gray-600 mt-1">
                {selectedDocuments.length > 0
                  ? `${selectedDocuments.filter(e => e.selected).length} of ${selectedDocuments.length} selected`
                  : 'No documents available'
                }
              </p>
            </div>

            {/* Documents List */}
            <div className="flex-1 overflow-y-auto p-4">
              {selectedDocuments.length > 0 ? (
                <div className="space-y-2">
                  {selectedDocuments.map((entry, index) => (
                    <div key={entry.guid} className="flex items-start p-3 hover:bg-gray-50 rounded-md transition-colors">
                      <input
                        type="checkbox"
                        id={`doc-${index}`}
                        checked={entry.selected !== false}
                        onChange={() => {
                          const updatedDocuments = [...selectedDocuments];
                          updatedDocuments[index] = {
                            ...updatedDocuments[index],
                            selected: !updatedDocuments[index].selected
                          };
                          setSelectedDocuments(updatedDocuments);
                        }}
                        className="mt-1 h-4 w-4 text-[#01a982] rounded border-gray-300 focus:ring-[#01a982]"
                      />
                      <label htmlFor={`doc-${index}`} className="ml-3 flex-1 cursor-pointer">
                        <div className="text-sm font-medium text-gray-900 break-words">{entry.filename}</div>
                        <div className="text-xs text-gray-500 mt-1">ID: {entry.guid.substring(0, 8)}...</div>
                      </label>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="mx-auto h-12 w-12 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p className="text-sm text-gray-500 font-medium">No documents available</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}