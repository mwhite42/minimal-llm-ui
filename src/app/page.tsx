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
      const response = await fetch(`${vectorSearchBaseUrl}/v1.0/vector/search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          query: query,
          document_guid: "f49f92f7-8cdf-4f44-b327-0519e2aad881",
          limit: 5
        })
      });

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
      contextFromVectorSearch = "Context from vector search:\n" + 
        vectorSearchResults.map((result: any) => result.content).join("\n") + 
        "\n\nUser query: " + input;
    } else {
      contextFromVectorSearch = input;
    }

    // Use the context in the request to Ollama
    // Add system instruction at the beginning of the messages array
    const messagesWithSystemInstruction = [
      new SystemMessage(activeSystemInstruction.content),
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
    }

    // Prepare the messages for Ollama, including vector search results if available
    const messagesForOllama = [
      new SystemMessage(activeSystemInstruction.content),
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
        "You're a tool, that receives an input and responds exclusively with a 2-5 word summary of the topic (and absolutely no prose) based specifically on the words used in the input (not the expected output). Each word in the summary should be carefully chosen so that it's perfecly informative - and serve as a perfect title for the input. Now, return the summary for the following input:\n" +
          input,
      )
      .then((name) => name);
  }

  return (
    <main className="relative flex max-h-screen min-h-screen w-screen max-w-[100vw] items-center justify-between overflow-hidden">
      <Sidebar
        activeConversation={activeConversation}
        conversations={conversations}
        menuState={menuState}
        setActiveConversation={setActiveConversation}
        setConversations={setConversations}
        setMessages={setMessages}
        setNewPrompt={setNewPrompt}
        toggleMenuState={toggleMenuState}
      />
      <div
        className="flex max-h-screen min-h-screen w-full flex-col"
        style={{ maxWidth: "calc(100vw - " + (menuState ? 20 : 0) + "rem)" }}
      >
        <AppNavbar
          documentName={activeConversation}
          setDocumentName={() => {}}
          activeModel={activeModel}
          availableModels={availableModels}
          setActiveModel={setActiveModel}
          setOllama={setOllama}
        />
        <div className="flex w-full flex-1 flex-shrink flex-col items-center justify-end gap-y-4 overflow-hidden whitespace-break-spaces">
          <div className="flex w-full flex-1 flex-col items-center justify-end gap-y-4 overflow-scroll whitespace-break-spaces">
            <div
              ref={msgContainerRef}
              className="block h-fit w-full flex-col items-center justify-center gap-y-1 overflow-scroll rounded-md p-2"
            >
              {messages.map((msg) => (
                <div
                  key={"message-" + msg.id}
                  className={cn(
                    "flex h-fit max-w-[80%] cursor-pointer flex-col items-start gap-y-1 rounded-md px-2 py-1",
                    { "ml-auto": msg.type == "human" },
                    { "mr-auto": msg.type == "ai" },
                  )}
                >
                  <div
                    className={cn(
                      "flex h-fit max-w-full cursor-pointer flex-col items-center gap-y-1 rounded-md border border-[#191919] px-2 py-1",
                      { "ml-auto": msg.type == "human" },
                      { "mr-auto": msg.type == "ai" },
                    )}
                  >
                    <p className="mr-auto text-xs text-white/50">
                      {(msg?.model?.split(":")[0] || "user") +
                        " • " +
                        new Date(msg.timestamp).toLocaleDateString() +
                        " " +
                        new Date(msg.timestamp).toLocaleTimeString()}
                    </p>
                    <Markdown
                      remarkPlugins={[[remarkGfm, { singleTilde: false }]]}
                      className={
                        "mr-auto flex w-full flex-col text-sm text-white"
                      }
                    >
                      {msg.content.trim()}
                    </Markdown>
                  </div>
                  <div
                    className={cn(
                      "my-2 flex gap-x-1",
                      { "ml-auto": msg.type == "human" },
                      { "mr-auto": msg.type == "ai" },
                    )}
                  >
                    {msg.type == "human" && (
                      <SaveIcon
                        onClick={() => {
                          setModalConfig({
                            modal: AppModal.SAVE_PROMPT,
                            data: msg,
                          });
                        }}
                        className="h-4 w-4 fill-white/50 hover:fill-white/90"
                      />
                    )}
                    <RefreshIcon
                      onClick={() => refreshMessage(msg)}
                      className="h-4 w-4 fill-white/50 hover:fill-white/90"
                    />
                    <CopyIcon
                      onClick={() => {
                        navigator.clipboard.writeText(msg.content);
                      }}
                      className="h-4 w-4 fill-white/50 hover:fill-white/90"
                    />
                    <TrashIcon
                      onClick={() => {
                        deleteMessage(msg);
                      }}
                      className="h-4 w-4 fill-white/50 hover:fill-white/90"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-y-2 px-4">
          <CommandMenu
            showMenu={
              !activePromptTemplate &&
              !!newPrompt &&
              newPrompt.startsWith("/") &&
              newPrompt == "/" + newPrompt.replace(/[^a-zA-Z0-9_]/g, "")
            }
            filterString={newPrompt.substring(1)}
          />
          {/* TODO: Include Active Prompt Template when selected above so we know what's beind done or insert placeholder input as it's being populated */}
          <div className="mb-4 flex max-h-[200px] min-h-[56px] w-full flex-shrink-0 resize-none appearance-none overflow-hidden rounded-md text-sm font-normal text-white outline-0 focus:outline-0 focus:ring-white/10 md:flex">
            {activePromptTemplate ? (
              <>
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
              </>
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
                  } else if (
                    e.key === "Enter" &&
                    (e.metaKey || !e.shiftKey || !e.altKey)
                  ) {
                    // console.log(e);
                  }
                }}
                value={newPrompt}
                placeholder="Send a message"
              />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
