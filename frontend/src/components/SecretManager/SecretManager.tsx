import { useState, useEffect } from "react";
import {
  Button,
  Input,
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  Divider,
  Tooltip,
  Chip,
} from "@nextui-org/react";

interface SecretPair {
  key: string;
  value: string;
  id: string;
}

// Icons
const PlusIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 4v16m8-8H4"
    />
  </svg>
);

const SaveIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
    />
  </svg>
);

const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const KeyIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-default-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
    />
  </svg>
);

const ValueIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 text-default-400"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
    />
  </svg>
);

const SuccessIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const InfoIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-5 w-5 text-warning"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

export const SecretManager = () => {
  const [secretPairs, setSecretPairs] = useState<SecretPair[]>([
    { key: "", value: "", id: crypto.randomUUID() },
  ]);
  const [isSaved, setIsSaved] = useState(false);

  // Load secrets from localStorage on component mount
  useEffect(() => {
    try {
      const savedSecrets = localStorage.getItem("APP_SECRET");
      if (savedSecrets) {
        const parsedSecrets = JSON.parse(atob(savedSecrets));
        const items: Array<{ key: string; value: string; id: string }> = [];
        Object.keys(parsedSecrets).map((res) => {
          items.push({
            key: res,
            value: parsedSecrets[res],
            id: crypto.randomUUID(),
          });
        });
        if (Array.isArray(items) && items.length > 0) {
          setSecretPairs(items);
        }
      }
    } catch (error) {
      console.error("Error loading secrets from localStorage:", error);
    }
  }, []);

  const handleAddPair = () => {
    setSecretPairs([
      ...secretPairs,
      { key: "", value: "", id: crypto.randomUUID() },
    ]);
    setIsSaved(false);
  };

  const handleRemovePair = (id: string) => {
    if (secretPairs.length > 1) {
      setSecretPairs(secretPairs.filter((pair) => pair.id !== id));
      setIsSaved(false);
    }
  };

  const handleKeyChange = (id: string, newKey: string) => {
    setSecretPairs(
      secretPairs.map((pair) =>
        pair.id === id ? { ...pair, key: newKey } : pair,
      ),
    );
    setIsSaved(false);
  };

  const handleValueChange = (id: string, newValue: string) => {
    setSecretPairs(
      secretPairs.map((pair) =>
        pair.id === id ? { ...pair, value: newValue } : pair,
      ),
    );
    setIsSaved(false);
  };

  const handleSave = () => {
    try {
      // Filter out empty pairs
      const filteredPairs = secretPairs.filter(
        (pair) => pair.key.trim() !== "",
      );

      // Convert to Record<string, string>
      const secretRecord = filteredPairs.reduce(
        (acc: Record<string, string>, pair) => {
          acc[pair.key] = pair.value;
          return acc;
        },
        {},
      );

      localStorage.setItem("APP_SECRET", btoa(JSON.stringify(secretRecord)));
      setIsSaved(true);

      // Show saved status for 3 seconds
      setTimeout(() => {
        setIsSaved(false);
      }, 3000);
    } catch (error) {
      console.error("Error saving secrets to localStorage:", error);
    }
  };

  return (
    <div className="h-100 items-center justify-center">
      <div className="w-full justify-center items-center flex max-w-[800px] mx-auto my-10 px-6 animate-fade-in">
        <Card className="bg-content1 border border-content3 shadow-lg">
          <CardHeader className="flex justify-between items-center px-3 py-3">
            <div className="flex items-center justify-center gap-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 text-success mx-1"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <h2 className="text-xl font-semibold text-foreground">
                Secrets Manager
              </h2>
            </div>
            <div className="text-sm text-foreground/60 bg-content2/40 px-3 py-1 rounded-full">
              {secretPairs.filter((p) => p.key.trim() !== "").length} secret
              {secretPairs.filter((p) => p.key.trim() !== "").length !== 1
                ? "s"
                : ""}{" "}
              configured
            </div>
          </CardHeader>
          <Divider className="bg-content3" />
          <CardBody className="p-0 h-auto max-h-[70vh] flex flex-col">
            <div className="flex items-center gap-3 bg-content2/50 p-4 m-4 mb-0 rounded-lg">
              <InfoIcon />
              <p className="text-sm text-foreground/80">
                Add key-value pairs that will be stored in your browser's local
                storage.
              </p>
            </div>

            <div className="overflow-y-auto flex-grow px-4 py-5">
              <div className="space-y-4">
                {secretPairs.map((pair) => (
                  <div
                    key={pair.id}
                    className="flex gap-1 items-center rounded-lg transition-colors hover:bg-content2/30 group"
                  >
                    <div className="flex-1 flex gap-4">
                      <Input
                        placeholder="Enter key"
                        value={pair.key}
                        onChange={(e) =>
                          handleKeyChange(pair.id, e.target.value)
                        }
                        startContent={<KeyIcon />}
                        classNames={{
                          base: "max-w-full",
                          inputWrapper: [
                            "bg-content2/50",
                            "hover:bg-content2",
                            "group-data-[focused=true]:bg-content2",
                            "!cursor-text",
                            "transition-colors",
                            "!border-content3",
                            "h-11",
                            "py-2",
                          ],
                          input: "text-foreground",
                        }}
                        variant="bordered"
                        radius="lg"
                        size="md"
                      />
                      <Input
                        placeholder="Enter value"
                        value={pair.value}
                        onChange={(e) =>
                          handleValueChange(pair.id, e.target.value)
                        }
                        startContent={<ValueIcon />}
                        classNames={{
                          base: "max-w-full",
                          inputWrapper: [
                            "bg-content2/50",
                            "hover:bg-content2",
                            "group-data-[focused=true]:bg-content2",
                            "!cursor-text",
                            "transition-colors",
                            "!border-content3",
                            "h-11",
                            "py-2",
                          ],
                          input: "text-foreground",
                        }}
                        variant="bordered"
                        radius="lg"
                        size="md"
                      />
                    </div>
                    <Tooltip content="Remove pair" color="danger">
                      <Button
                        isIconOnly
                        color="danger"
                        variant="light"
                        onPress={() => handleRemovePair(pair.id)}
                        disabled={secretPairs.length <= 1}
                        size="md"
                        className="min-w-10 w-10 h-10 opacity-70 hover:opacity-100 flex-shrink-0 ml-1"
                        radius="full"
                      >
                        <TrashIcon />
                      </Button>
                    </Tooltip>
                  </div>
                ))}
              </div>
            </div>
          </CardBody>
          <Divider className="bg-content3" />
          <CardFooter className="px-4 py-4 flex justify-between items-center">
            {isSaved && (
              <div className="flex items-center gap-2 animate-fade-in">
                <Chip
                  color="success"
                  variant="flat"
                  startContent={<SuccessIcon />}
                  className="h-8 px-1"
                >
                  Secrets saved successfully!
                </Chip>
              </div>
            )}
            <div className="flex gap-3 ml-auto">
              <Button
                color="primary"
                variant="flat"
                onPress={handleAddPair}
                startContent={<PlusIcon />}
                size="sm"
                className="min-h-10 h-10 px-4 text-sm font-medium"
                radius="lg"
              >
                Add Pair
              </Button>
              <Button
                color="primary"
                onPress={handleSave}
                startContent={<SaveIcon />}
                size="sm"
                className="min-h-10 h-10 px-4 text-sm font-medium"
                radius="lg"
              >
                Save
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
};

export default SecretManager;
