"use client";

import { ChatOllama } from "langchain/chat_models/ollama";
import { baseUrl } from "@/utils/constants";
import { useEffect, useRef, useState } from "react";
import { useSystemInstruction } from "@/app/context/SystemInstructionContext";
import { AppModal, useModal } from "@/app/context/ModalContext";

type DocumentEntry = {
  filename: string;
  guid: string;
  selected?: boolean;
};

type Props = {
  documentName: string;
  setDocumentName: Function;
  activeModel: string;
  availableModels: any[];
  setActiveModel: Function;
  setOllama: Function;
  setDocumentValues?: (documents: DocumentEntry[] | DocumentEntry | string, guid?: string) => void; // Function to set document entries
};

export default function AppNavbar({
  documentName,
  setDocumentName,
  activeModel,
  availableModels,
  setActiveModel,
  setOllama,
  setDocumentValues,
}: Props) {
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSystemMenuOpen, setIsSystemMenuOpen] = useState(false);
  const [isDocumentMenuOpen, setIsDocumentMenuOpen] = useState(false);
  const [documentEntries, setDocumentEntries] = useState<DocumentEntry[]>([]);
  const { activeSystemInstruction, allSystemInstructions, setActiveSystemInstructionById } = useSystemInstruction();
  const { setModalConfig } = useModal();

  const systemMenuRef = useRef<HTMLDivElement>(null);
  const documentMenuRef = useRef<HTMLDivElement>(null);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    setDocumentName(value); // Call the callback function to update the parent component
  };

  useEffect(() => {
    const handleDocumentClick = (event: any) => {
      if (
        isShareMenuOpen &&
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target)
      ) {
        setIsShareMenuOpen(false);
      }

      if (
        isProfileMenuOpen &&
        profileMenuRef.current &&
        !profileMenuRef.current.contains(event.target)
      ) {
        setIsProfileMenuOpen(false);
      }

      if (
        isSystemMenuOpen &&
        systemMenuRef.current &&
        !systemMenuRef.current.contains(event.target)
      ) {
        setIsSystemMenuOpen(false);
      }

      if (
        isDocumentMenuOpen &&
        documentMenuRef.current &&
        !documentMenuRef.current.contains(event.target)
      ) {
        setIsDocumentMenuOpen(false);
      }
    };

    document.addEventListener("click", handleDocumentClick);

    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, [isShareMenuOpen, isProfileMenuOpen, isSystemMenuOpen, isDocumentMenuOpen]);

  function toggleModel() {
    const i =
      (availableModels.findIndex((x) => x.name == activeModel) + 1) %
      availableModels.length;
    console.log(i, activeModel, availableModels);
    setActiveModel(availableModels[i].name);
    const newOllama = new ChatOllama({
      baseUrl: baseUrl,
      model: availableModels[i]?.name,
    });
    //store in local storage
    localStorage.setItem("initialLocalLM", availableModels[i]?.name);
    setOllama(newOllama);
  }

  // Function to set document entries
  function setDocumentValuesInternal(documents: DocumentEntry[] | DocumentEntry) {
    console.log('setDocumentValuesInternal called with:', documents);

    // Handle both single document and array of documents
    if (Array.isArray(documents)) {
      // Filter out duplicates based on guid
      setDocumentEntries(prevEntries => {
        // Create a map of existing entries by guid for quick lookup
        const existingEntriesMap = new Map(
          prevEntries.map(entry => [entry.guid, entry])
        );

        // Process each new document
        documents.forEach(doc => {
          // Only add if it doesn't exist already
          if (!existingEntriesMap.has(doc.guid)) {
            existingEntriesMap.set(doc.guid, { ...doc, selected: true });
          }
        });

        // Convert map back to array
        return Array.from(existingEntriesMap.values());
      });
    } else {
      // If it's a single document, add it to the array if it doesn't exist already
      setDocumentEntries(prevEntries => {
        const exists = prevEntries.some(entry => entry.guid === documents.guid);
        if (!exists) {
          return [...prevEntries, { ...documents, selected: true }];
        }
        return prevEntries;
      });
    }

    // Call the prop function if provided
    if (setDocumentValues) {
      console.log('Calling parent setDocumentValues function');
      setDocumentValues(documents);
    } else {
      console.log('Parent setDocumentValues function not provided');
    }
  }

  // For backward compatibility - handle single document
  function setDocumentValuesSingle(filename: string, guid: string) {
    const newEntry: DocumentEntry = { filename, guid, selected: true };
    setDocumentValuesInternal(newEntry);
  }

  // Expose the function to the window object for external access
  useEffect(() => {
    console.log('Setting up window.setDocumentValues');

    // For backward compatibility, we need to handle both the new and old function signatures
    // @ts-ignore
    window.setDocumentValues = (filenameOrDocuments: string | DocumentEntry[], guid?: string) => {
      if (typeof filenameOrDocuments === 'string' && guid) {
        // Old signature: (filename: string, guid: string)
        setDocumentValuesSingle(filenameOrDocuments, guid);
      } else {
        // New signature: (documents: DocumentEntry[] | DocumentEntry)
        // @ts-ignore
        setDocumentValuesInternal(filenameOrDocuments);
      }
    };

    console.log('window.setDocumentValues is now:', typeof window.setDocumentValues);

    return () => {
      console.log('Cleaning up window.setDocumentValues');
      // @ts-ignore
      delete window.setDocumentValues;
    };
  }, []);

  const shareMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuRef = useRef<HTMLDivElement>(null);

  return (
    <>
      <nav className="sticky left-0 top-0 z-20 w-full border-b border-white/10 bg-black">
        <div className="mx-auto flex flex-wrap items-center justify-between px-20 py-2.5">
          <div className="flex space-x-8">
            <input
              className="w-64 ring-none flex cursor-text items-center gap-x-2 rounded-md border-transparent bg-transparent px-2 py-1 text-xs font-medium text-white outline-none placeholder:text-white/80 hover:bg-white/10 "
              placeholder="Untitled"
              value={documentName}
              onChange={handleInputChange}
            ></input>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center relative" ref={documentMenuRef}>
              <span className="mr-2 text-xs text-white/70">Document:</span>
              <button
                className="flex items-center text-xs text-white hover:bg-white/10 rounded-md px-2 py-1"
                onClick={() => setIsDocumentMenuOpen(!isDocumentMenuOpen)}
              >
                <span>
                  {documentEntries.length > 0
                    ? `${documentEntries.filter(entry => entry.selected).length} selected`
                    : "None"}
                </span>
                <svg
                  className="ml-1 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isDocumentMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-64 rounded-md shadow-lg bg-black border border-white/10 z-50 max-h-80 overflow-y-auto">
                  <div className="py-1">
                    {documentEntries.length > 0 ? (
                      documentEntries.map((entry, index) => (
                        <div key={entry.guid} className="px-4 py-2 text-xs text-white hover:bg-white/10">
                          <div className="flex items-center">
                            <input
                              type="checkbox"
                              id={`document-${index}`}
                              checked={entry.selected}
                              onChange={() => {
                                const updatedEntries = [...documentEntries];
                                updatedEntries[index] = {
                                  ...updatedEntries[index],
                                  selected: !updatedEntries[index].selected
                                };
                                setDocumentEntries(updatedEntries);

                                // Call the prop function to update parent component state
                                if (setDocumentValues) {
                                  setDocumentValues(updatedEntries);
                                }
                              }}
                              className="mr-2"
                            />
                            <label htmlFor={`document-${index}`} className="flex-1 cursor-pointer">
                              <div className="font-medium">{entry.filename}</div>
                              <div className="text-white/70 text-xs truncate">{entry.guid}</div>
                            </label>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-xs text-white/70">
                        No documents available
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center relative" ref={systemMenuRef}>
              <span className="mr-2 text-xs text-white/70">System:</span>
              <button
                className="flex items-center text-xs text-white hover:bg-white/10 rounded-md px-2 py-1"
                onClick={() => setIsSystemMenuOpen(!isSystemMenuOpen)}
              >
                <span>{activeSystemInstruction.name}</span>
                <svg
                  className="ml-1 h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isSystemMenuOpen && (
                <div className="absolute top-full left-0 mt-1 w-48 rounded-md shadow-lg bg-black border border-white/10 z-50">
                  <div className="py-1">
                    {allSystemInstructions.map((instruction) => (
                      <div
                        key={instruction.id}
                        className={`flex items-center justify-between px-4 py-2 text-xs ${
                          instruction.id === activeSystemInstruction.id
                            ? "bg-white/10 text-white"
                            : "text-white/70 hover:bg-white/5"
                        }`}
                      >
                        <button
                          className="flex-grow text-left"
                          onClick={() => {
                            setActiveSystemInstructionById(instruction.id);
                            setIsSystemMenuOpen(false);
                          }}
                        >
                          {instruction.name}
                        </button>
                        <button
                          className="ml-2 p-1 rounded-full hover:bg-white/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalConfig({
                              modal: AppModal.EDIT_SYSTEM_INSTRUCTION,
                              data: instruction
                            });
                            setIsSystemMenuOpen(false);
                          }}
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <hr className="my-1 border-white/10" />
                    <button
                      className="block w-full text-left px-4 py-2 text-xs text-white/70 hover:bg-white/5"
                      onClick={() => {
                        setModalConfig({ modal: AppModal.ADD_SYSTEM_INSTRUCTION });
                        setIsSystemMenuOpen(false);
                      }}
                    >
                      + Add New Instruction
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              className="cursor-pointer text-xs text-white transition-colors hover:bg-white/10 rounded-md px-2 py-1"
              contentEditable={false}
              onClick={toggleModel}
            >
              {activeModel}
            </button>
          </div>
        </div>
      </nav>
    </>
return (
    <nav className="sticky top-0 z-40 border-b bg-white shadow-sm">
      <div className="flex h-14 items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-4 ml-4">
          <input
            className="rounded-lg bg-gray-50 px-3 py-1.5 text-sm font-medium text-gray-700 outline-none placeholder-gray-400 transition-colors hover:bg-gray-100 focus:bg-white focus:ring-2 focus:ring-[#01a982] focus:ring-opacity-50"
            placeholder="Untitled Conversation"
            value={documentName}
            onChange={handleInputChange}
          />
        </div>
        <button
          className="rounded-lg border border-[#01a982] bg-white px-4 py-1.5 text-sm font-medium text-[#01a982] transition-all hover:bg-[#01a982] hover:text-white"
          onClick={toggleModel}
        >
          {activeModel || "Select Model"}
        </button>
      </div>
    </nav>
  );
}
