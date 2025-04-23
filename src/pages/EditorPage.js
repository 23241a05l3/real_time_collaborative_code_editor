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

    const languages = [
        { id: 'javascript', name: 'JavaScript' },
        { id: 'python', name: 'Python' },
        { id: 'java', name: 'Java' },
        { id: 'cpp', name: 'C++' },
        { id: 'c', name: 'C' },
        { id: 'go', name: 'Go' },
        { id: 'ruby', name: 'Ruby' }
    ];

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

            // Listening for joined event
            socketRef.current.on(
                ACTIONS.JOINED,
                ({ clients, username, socketId }) => {
                    if (username !== location.state?.username) {
                        toast.success(`${username} joined the room.`);
                        console.log(`${username} joined`);
                    }
                    setClients(clients);
                    socketRef.current.emit(ACTIONS.SYNC_CODE, {
                        code: codeRef.current,
                        socketId,
                    });
                    socketRef.current.emit(ACTIONS.SYNC_LANGUAGE, {
                        socketId,
                        language,
                    });
                }
            );

            // Listening for language change
            socketRef.current.on(ACTIONS.LANGUAGE_CHANGE, ({ language: newLanguage }) => {
                setLanguage(newLanguage);
            });

            // Listening for disconnected
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
            socketRef.current.disconnect();
            socketRef.current.off(ACTIONS.JOINED);
            socketRef.current.off(ACTIONS.DISCONNECTED);
            socketRef.current.off(ACTIONS.LANGUAGE_CHANGE);
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

        try {
            const body = {
                language: getPistonLanguage(language),
                source: codeRef.current,
                stdin: ''
            };

            const response = await fetch('https://emkc.org/api/v2/piston/execute', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(body),
            });

            const data = await response.json();

            if (data.run) {
                setOutput(
                    `Exit Code: ${data.run.code}\n` +
                    `Output: ${data.run.output || 'No output'}\n` +
                    (data.run.stderr ? `Error: ${data.run.stderr}` : '')
                );
            } else {
                setOutput('Failed to execute code');
            }
        } catch (error) {
            console.error('Error executing code:', error);
            setOutput(`Error: ${error.message || 'Unknown error occurred'}`);
            toast.error('Failed to execute code');
        } finally {
            setExecuting(false);
        }
    }

    function getPistonLanguage(editorLanguage) {
        const languageMap = {
            'javascript': 'javascript',
            'python': 'python3',
            'java': 'java',
            'cpp': 'cpp',
            'c': 'c',
            'go': 'go',
            'ruby': 'ruby'
        };

        return languageMap[editorLanguage] || 'javascript';
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
                {output !== null && (
                    <div className="output-pane">
                        <h4>Output:</h4>
                        <pre>{output}</pre>
                    </div>
                )}
            </div>
        </div>
    );
};

export default EditorPage;
