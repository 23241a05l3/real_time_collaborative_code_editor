import React, { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import ACTIONS from '../Actions';
import Client from '../components/Client';
import Editor from '../components/Editor';
import { initSocket } from '../socket';
import {
    useLocation,
    useNavigate,
    Navigate,
    useParams,
} from 'react-router-dom';

const EditorPage = () => {
    const socketRef = useRef(null);
    const codeRef = useRef(null);
    const location = useLocation();
    const { roomId } = useParams();
    const reactNavigator = useNavigate();
    const [clients, setClients] = useState([]);
    const [language, setLanguage] = useState('javascript');
    const [executing, setExecuting] = useState(false);
    const [output, setOutput] = useState(null);
    const [executionError, setExecutionError] = useState(null);
    const [stdin, setStdin] = useState('');
    const [showStdin, setShowStdin] = useState(false);
    const [executionStats, setExecutionStats] = useState(null);
    const [apiResponse, setApiResponse] = useState(null);
    const [terminalExpanded, setTerminalExpanded] = useState(false);

    const languages = [
        { id: 'javascript', name: 'JavaScript' },
        { id: 'python', name: 'Python' },
        { id: 'java', name: 'Java' },
        { id: 'cpp', name: 'C++' },
        { id: 'c', name: 'C' },
        { id: 'go', name: 'Go' },
        { id: 'ruby', name: 'Ruby' }
    ];

    const codeTemplates = {
        'javascript': 'console.log("Hello, World!");',
        'python': 'print("Hello, World!")',
        'java': 'public class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, World!");\n  }\n}',
        'cpp': '#include <iostream>\n\nint main() {\n  std::cout << "Hello, World!" << std::endl;\n  return 0;\n}',
        'c': '#include <stdio.h>\n\nint main() {\n  printf("Hello, World!\\n");\n  return 0;\n}',
        'go': 'package main\n\nimport "fmt"\n\nfunc main() {\n  fmt.Println("Hello, World!")\n}',
        'ruby': 'puts "Hello, World!"'
    };

    useEffect(() => {
        const init = async () => {
            socketRef.current = await initSocket();
            socketRef.current.on('connect_error', (err) => handleErrors(err));
            socketRef.current.on('connect_failed', (err) => handleErrors(err));

            function handleErrors(e) {
                console.log('socket error', e);
                toast.error('Socket connection failed, try again later.');
                reactNavigator('/');
            }

            socketRef.current.emit(ACTIONS.JOIN, {
                roomId,
                username: location.state?.username,
            });

            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current || codeTemplates[language],
                        socketId,
                    });
                    socketRef.current.emit(ACTIONS.SYNC_LANGUAGE, {
                        socketId,
                        language,
                    });
                }
            );

            socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ language: newLanguage }) => {
                setLanguage(newLanguage);
                if (!codeRef.current || codeRef.current.trim() === '') {
                    codeRef.current = codeTemplates[newLanguage];
                    socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code: codeTemplates[newLanguage]
                    });
                }
            });

            socketRef.current.on(
                ACTIONS.DISCONNECTED,
                ({ socketId, username }) => {
                    toast.success(`${username} left the room.`);
                    setClients((prev) => {
                        return prev.filter(
                            (client) => client.socketId !== socketId
                        );
                    });
                }
            );
        };
        init();
        return () => {
            socketRef.current?.disconnect();
            socketRef.current?.off(ACTIONS.JOINED);
            socketRef.current?.off(ACTIONS.DISCONNECTED);
            socketRef.current?.off(ACTIONS.LANGUAGE_CHANGE);
        };
    }, []);

    async function copyRoomId() {
        try {
            await navigator.clipboard.writeText(roomId);
            toast.success('Room ID has been copied to your clipboard');
        } catch (err) {
            toast.error('Could not copy the Room ID');
            console.error(err);
        }
    }

    function leaveRoom() {
        reactNavigator('/');
    }

    function handleLanguageChange(e) {
        const newLanguage = e.target.value;
        setLanguage(newLanguage);
        if (!codeRef.current || codeRef.current.trim() === '') {
            codeRef.current = codeTemplates[newLanguage];
            socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                roomId,
                code: codeTemplates[newLanguage]
            });
        }
        socketRef.current.emit(ACTIONS.LANGUAGE_CHANGE, {
            roomId,
            language: newLanguage,
        });
    }

    async function runCode() {
        if (!codeRef.current) {
            toast.error('No code to execute');
            return;
        }

        setExecuting(true);
        setOutput('Executing...');
        setExecutionError(null);
        setExecutionStats(null);
        setApiResponse(null);
        setTerminalExpanded(true);

        try {
            const pistonBody = {
                language: getPistonLanguage(language),
                version: getPistonVersion(language),
                files: [
                    {
                        name: getFileName(language),
                        content: codeRef.current
                    }
                ],
                stdin: stdin,
                args: [],
                compile_timeout: 10000,
                run_timeout: 5000,
                compile_memory_limit: -1,
                run_memory_limit: -1
            };

            console.log('Executing code with:', pistonBody);

            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(pistonBody),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.json();
            console.log('Execution response:', data);
            
            setApiResponse(data);

            if (data.run) {
                const runOutput = data.run.output || '';
                const compileOutput = data.compile?.output || '';
                
                if (data.run.stderr) {
                    setExecutionError(data.run.stderr);
                }
                
                if (data.compile?.stderr) {
                    setExecutionError((prev) => 
                        prev ? `${prev}\n\nCompile Error:\n${data.compile.stderr}` : `Compile Error:\n${data.compile.stderr}`
                    );
                }
                
                let finalOutput = '';
                if (compileOutput) finalOutput += `Compilation Output:\n${compileOutput}\n\n`;
                finalOutput += runOutput || 'No output';
                
                setOutput(finalOutput);
                
                setExecutionStats({
                    language: data.language,
                    version: data.version,
                    runtime: data.run.time,
                    compileTime: data.compile?.time,
                    exitCode: data.run.code
                });

                if (data.run.code !== 0) {
                    toast.error(`Execution failed with exit code: ${data.run.code}`);
                } else {
                    toast.success('Code executed successfully');
                }
            } else {
                setOutput('Failed to execute code');
                setExecutionError('The execution service returned an invalid response format');
                toast.error('Failed to execute code');
            }
        } catch (error) {
            console.error('Error executing code:', error);
            setOutput(null);
            setExecutionError(`Error: ${error.message || 'Unknown error occurred'}`);
            toast.error('Failed to execute code');
        } finally {
            setExecuting(false);
        }
    }

    function getPistonLanguage(editorLanguage) {
        const languageMap = {
            'javascript': 'javascript',
            'python': 'python',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'go': 'go',
            'ruby': 'ruby'
        };

        return languageMap[editorLanguage] || 'javascript';
    }
    
    function getPistonVersion(editorLanguage) {
        const versionMap = {
            'javascript': '18.15.0',
            'python': '3.10.0',
            'java': '15.0.2',
            'cpp': '10.2.0',
            'c': '10.2.0',
            'go': '1.16.2',
            'ruby': '3.0.1'
        };

        return versionMap[editorLanguage];
    }
    
    function getFileName(editorLanguage) {
        const fileNameMap = {
            'javascript': 'script.js',
            'python': 'script.py',
            'java': 'Main.java',
            'cpp': 'main.cpp',
            'c': 'main.c',
            'go': 'main.go',
            'ruby': 'script.rb'
        };

        return fileNameMap[editorLanguage];
    }

    function toggleStdinInput() {
        setShowStdin(!showStdin);
    }
    
    function toggleTerminalExpansion() {
        setTerminalExpanded(!terminalExpanded);
    }

    if (!location.state) {
        return <Navigate to="/" />;
    }

    return (
        <div className="mainWrap">
            <div className="aside">
                <div className="asideInner">
                    <div className="logo">
                        <img
                            className="logoImage"
                            src="/codeX1.png"
                            alt="logo"
                        />
                    </div>
                    <h3>Connected</h3>
                    <div className="clientsList">
                        {clients.map((client) => (
                            <Client
                                key={client.socketId}
                                username={client.username}
                            />
                        ))}
                    </div>
                </div>
                <div className="language-selector">
                    <label htmlFor="language">Language:</label>
                    <select
                        id="language"
                        value={language}
                        onChange={handleLanguageChange}
                        className="language-dropdown"
                    >
                        {languages.map((lang) => (
                            <option key={lang.id} value={lang.id}>
                                {lang.name}
                            </option>
                        ))}
                    </select>
                </div>
                <button className="btn stdinBtn" onClick={toggleStdinInput}>
                    {showStdin ? 'Hide Input' : 'Add Input (stdin)'}
                </button>
                <button className="btn runBtn" onClick={runCode} disabled={executing}>
                    {executing ? 'Running...' : 'Run Code'}
                </button>
                <button className="btn copyBtn" onClick={copyRoomId}>
                    Copy ROOM ID
                </button>
                <button className="btn leaveBtn" onClick={leaveRoom}>
                    Leave
                </button>
            </div>
            <div className="editorWrap">
                <Editor
                    socketRef={socketRef}
                    roomId={roomId}
                    language={language}
                    onCodeChange={(code) => {
                        codeRef.current = code;
                    }}
                />
                {showStdin && (
                    <div className="stdin-container">
                        <h4>Standard Input:</h4>
                        <textarea 
                            className="stdin-textarea"
                            value={stdin}
                            onChange={(e) => setStdin(e.target.value)}
                            placeholder="Enter input for your program..."
                        />
                    </div>
                )}
                {(output !== null || executionError !== null || executionStats !== null || apiResponse !== null) && (
                    <div className={`output-terminal ${terminalExpanded ? 'expanded' : ''}`}>
                        <div className="terminal-header">
                            <h4>Output Terminal</h4>
                            <button 
                                className="terminal-toggle-btn" 
                                onClick={toggleTerminalExpansion}
                            >
                                {terminalExpanded ? 'Minimize' : 'Expand'}
                            </button>
                        </div>
                        <div className="terminal-content">
                            {executionStats && (
                                <div className="execution-stats">
                                    <p>Language: {executionStats.language} {executionStats.version}</p>
                                    <p>
                                        {executionStats.compileTime !== undefined ? 
                                            `Compile time: ${executionStats.compileTime} ms | ` : ''}
                                        Runtime: {executionStats.runtime} ms | Exit code: {executionStats.exitCode}
                                    </p>
                                </div>
                            )}
                            {executionError && (
                                <div className="error-output">
                                    <h5>Error:</h5>
                                    <pre>{executionError}</pre>
                                </div>
                            )}
                            {output && (
                                <div className="standard-output">
                                    <h5>Standard Output:</h5>
                                    <pre>{output}</pre>
                                </div>
                            )}
                            {apiResponse && terminalExpanded && (
                                <div className="api-response">
                                    <h5>API Response (Debug):</h5>
                                    <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorPage;
