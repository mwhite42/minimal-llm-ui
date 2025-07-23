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

// Define the DocumentEntry type to match the one in app-navbar.tsx
type DocumentEntry = {
  filename: string;
  guid: string;
  selected?: boolean;
};

// This is now defined in global.d.ts

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
  const [conversations, setConversations] = useState<
    { title: string; filePath: string }[]
  >([]);
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
  }, []);

  function getInitialModel() {
    fetch(`${baseUrl}/api/tags`)
      .then((response) => response.json())
      .then((data) => {
        // console.log(data);
        setAvailableModels(data.models);

        // get initial model from local storage
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
          // set initial model to first model in list
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
      method: "POST", // or 'GET', 'PUT', etc.
      body: JSON.stringify({
        conversationPath: "./conversations",
      }),
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json",
      },
    }).then((response) => {
      // console.log(response),
      response.json().then((data) => setConversations(data));
    });
  }

  async function performVectorSearch(query: string) {
    try {
      // Check if there are any selected documents
      const selectedDocs = selectedDocuments.filter(doc => doc.selected);

      let response;

      if (selectedDocs.length > 0) {
        // If documents are selected, use /vector/search API with document_guids
        const document_guids = selectedDocs.map(doc => doc.guid);

        console.log(`Using /vector/search API with ${document_guids.length} selected documents`);

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
        // If no documents are selected, use /vector/router/search API
        console.log('Using /vector/router/search API (no documents selected)');

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
    if (!ollama) return;
    scrollToBottom();
    if (messages.length == 0) getName(input);
    const msg = {
      type: "human",
      id: generateRandomString(8),
      timestamp: Date.now(),
      content: input,
    };
    const model = activeModel;
    let streamedText = "";
    messages.push(msg);
    const msgCache = [...messages];

    // First perform vector search
    const vectorSearchResults = await performVectorSearch(input);

    // Prepare context from vector search results
    let contextFromVectorSearch = "";
    if (vectorSearchResults && vectorSearchResults.length > 0) {
      // Update Document dropdown with all results
      if (window.setDocumentValues) {
        // Convert vector search results to DocumentEntry array
        const documentEntries: DocumentEntry[] = vectorSearchResults.map((result: any) => ({
          filename: decodeURIComponent(result.object_key),
          guid: result.document_guid,
          selected: true
        }));

        // Pass all document entries to the dropdown
        window.setDocumentValues(documentEntries);
      }

      contextFromVectorSearch = "Context from vector search:\n" +
        vectorSearchResults.map((result: any) => result.content).join("\n") +
        "\n\nUser query: " + input;
    } else {
      contextFromVectorSearch = input;
    }

    // Use the context in the request to Ollama
    // Add system instruction at the beginning of the message array
    // If no documents are selected, use the Concise system instruction
    const selectedDocs = selectedDocuments.filter(doc => doc.selected);
    const systemInstruction = selectedDocs.length === 0
      ? getSystemInstructionById("concise") || activeSystemInstruction
      : activeSystemInstruction;

    console.log(`Using ${systemInstruction.name} system instruction`);

    const messagesWithSystemInstruction = [
      new SystemMessage(systemInstruction.content),
      ...messages.map((m, index) => {
        if (index === messages.length - 1 && m.type === "human") {
          // Replace the last human message with the context-enhanced version
          return new HumanMessage(contextFromVectorSearch);
        } else {
          return m.type === "human"
            ? new HumanMessage(m.content)
            : new AIMessage(m.content);
        }
      })
    ];

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
      setMessages(() => updatedMessages);
      c++;
      if (c % 8 == 0) scrollToBottom();
    }

    scrollToBottom();
    persistConvo(updatedMessages);
  }

  async function persistConvo(messages: any[]) {
    let name = activeConversation;
    if (name == "") {
      name = (await getName(newPrompt)).trim();
      // console.log(name.trim());
      setActiveConversation(name.trim());
    }

    fetch("../api/fs/persist-convo", {
      method: "POST", // or 'GET', 'PUT', etc.
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
    // console.log("filtered", filtered);

    setMessages(() => filtered);
    // useEffect on change here if the last value was a human message?

    const model = activeModel;
    let streamedText = "";
    const msgCache = [...filtered];

    // Get the last human message for vector search
    const lastHumanMessage = filtered.filter(m => m.type === "human").pop();
    let vectorSearchResults: any[] | null = null;

    if (lastHumanMessage) {
      // Perform vector search with the last human message
      vectorSearchResults = await performVectorSearch(lastHumanMessage.content);

      // Update Document dropdown with all results
      if (vectorSearchResults && vectorSearchResults.length > 0 && window.setDocumentValues) {
        // Convert vector search results to DocumentEntry array
        const documentEntries: DocumentEntry[] = vectorSearchResults.map((result: any) => ({
          filename: decodeURIComponent(result.object_key),
          guid: result.document_guid,
          selected: true
        }));

        // Pass all document entries to the dropdown
        // @ts-ignore
        window.setDocumentValues(documentEntries);
      }
    }

    // Prepare the messages for Ollama, including vector search results if available
    // If no documents are selected, use the Concise system instruction
    const selectedDocs = selectedDocuments.filter(doc => doc.selected);
    const systemInstruction = selectedDocs.length === 0
      ? getSystemInstructionById("concise") || activeSystemInstruction
      : activeSystemInstruction;

    console.log(`Using ${systemInstruction.name} system instruction`);

    const messagesForOllama = [
      new SystemMessage(systemInstruction.content),
      ...filtered.map((m, index) => {
        if (index === filtered.length - 1 && m.type === "human" && vectorSearchResults && vectorSearchResults.length > 0) {
          // Enhance the last human message with vector search results
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
            setSelectedDocuments([documents]);
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
          setDocumentName={() => {
          }}
          activeModel={activeModel}
          availableModels={availableModels}
          setActiveModel={setActiveModel}
          setOllama={setOllama}
          setDocumentValues={(documents: DocumentEntry[] | DocumentEntry | string, guid?: string) => {
            if (typeof documents === 'string' && guid) {
              const newEntry: DocumentEntry = {
                filename: documents as string,
                guid: guid as string,
                selected: true
              };
              setSelectedDocuments([newEntry]);
            } else if (Array.isArray(documents)) {
              setSelectedDocuments(documents);
            } else {
              setSelectedDocuments([documents as DocumentEntry]);
            }
          }}
        />
        <div className="flex-1 overflow-hidden bg-[--hpe-gray-lightest]">
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
                      <p className="text-gray-500">Start a conversation to begin by telling us what system your interested in getting some information about. </p>
                      <p className="text-gray-500">That will help the system narrow down the scope and provide the best responses</p>
                      <p className="text-gray-500">You can then select which documents you wish to research from the navigation above</p>
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
      </div>
    </main>
  );
}
