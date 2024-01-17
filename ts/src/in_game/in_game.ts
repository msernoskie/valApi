import {
  OWGames,
  OWGamesEvents,
  OWHotkeys
} from "@overwolf/overwolf-api-ts";

import { AppWindow } from "../AppWindow";
import { kHotkeys, kWindowNames, kGamesFeatures } from "../consts";
import fetch from "node-fetch";

import WindowState = overwolf.windows.WindowStateEx;

let KILL_COUNT_FOR_ACE: number = 1;
let HA_URL = "http://homeassistant.local:8123";
let HA_API = "/api/services/input_boolean/toggle";
let HA_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJhOWY3OTE4ZjYxZDQ0YTQ2YjIxNDE3MmEyNzc3NGMyYiIsImlhdCI6MTcwMzYzNjcyNSwiZXhwIjoyMDE4OTk2NzI1fQ.GLsxRDXYSQWlJIv9gk8AgsR8HIl7Ucz3GK4pfe7QcY8";
let INPUT_BOOLEAN_ENTITY_ID = 'input_boolean.valorant_api_light_test';

// The window displayed in-game while a game is running.
// It listens to all info events and to the game events listed in the consts.ts file
// and writes them to the relevant log using <pre> tags.
// The window also sets up Ctrl+F as the minimize/restore hotkey.
// Like the background window, it also implements the Singleton design pattern.
class InGame extends AppWindow {
  private static _instance: InGame;
  private _gameEventsListener: OWGamesEvents;
  private _eventsLog: HTMLElement;
  private _infoLog: HTMLElement;
  private _playerName: String;
  private _killFeedSet: Set<String>;

  private constructor() {
    super(kWindowNames.inGame);

    this._eventsLog = document.getElementById('eventsLog');
    this._infoLog = document.getElementById('infoLog');

    this.setToggleHotkeyBehavior();
    this.setToggleHotkeyText();
  }

  public static instance() {
    if (!this._instance) {
      this._instance = new InGame();
    }

    return this._instance;
  }

  public async run() {
    const gameClassId = await this.getCurrentGameClassId();

    const gameFeatures = kGamesFeatures.get(gameClassId);

    if (gameFeatures && gameFeatures.length) {
      this._gameEventsListener = new OWGamesEvents(
        {
          onInfoUpdates: this.onInfoUpdates.bind(this),
          onNewEvents: this.onNewEvents.bind(this)
        },
        gameFeatures
      );

      this._gameEventsListener.start();
    }
  }

  private onInfoUpdates(info) {
    if (info.match_info.round_phase == "shopping") {
      // FE: Reset killfeed per round (new round means shopping)
      this._killFeedSet = new Set<string>();
    }

    // Check for a roster info update. Grab the current user name that way.
    for (let i = 0; i < 10; i++) {
      var rosterString = 'roster_' + i.toString();
      if (rosterString in info.match_info) {
        var cleanedString = info.match_info[rosterString].replace(/\\/g, '');    
        var rosterObj = JSON.parse(cleanedString);
        if (rosterObj.local == true) {
          var hashIndex = rosterObj.name.indexOf('#');
          this._playerName = rosterObj.name.substring(0, hashIndex).trimRight();;
          this.logLine(this._infoLog, `Local player: ${this._playerName}`, true);
        }
      }
    }
    this.logLine(this._infoLog, info, false);
  }

  private toggleInputBoolean(): Promise<void> {
    const headers = new Headers({
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    });
  
    // Toggle the input boolean state
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ entity_id: INPUT_BOOLEAN_ENTITY_ID }),
    };
    this.logLine(this._eventsLog, "Calling...", true);
    return fetch("https://google.com")
      .then(response => {
        this.logLine(this._eventsLog, `Response Status: ${response.status}`, true);
        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
      });
  }

  // Special events will be highlighted in the event log
  private onNewEvents(e) {
     const headers = new Headers({
      'Authorization': `Bearer ${HA_TOKEN}`,
      'Content-Type': 'application/json',
    });
  
    // Toggle the input boolean state
    const requestOptions: RequestInit = {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ entity_id: INPUT_BOOLEAN_ENTITY_ID }),
      mode: 'cors',
    };

    const shouldHighlight = e.events.some(event => {
      switch (event.name) {
        case 'kill_feed':
          var cleanedString = event.data.replace(/\\/g, '');    
          var feedObj = JSON.parse(cleanedString);

          // TODO: Hardcode this when testing in range
          if (feedObj.attacker == "Smelvin") {// this._playerName) {
            this.logLine(this._eventsLog, "Suicide", false);
            // fetch("http://192.168.1.133:5000/proxy", requestOptions)
            // .then(response => {
            //   if (response.ok) {
            //     return response.json();
            //   } else {
            //     throw new Error(`HTTP error! Status: ${response.status}`);
            //   }
            // })
            // .then(data => {
            //   this.logLine(this._eventsLog, `API Response: ${data}`, true);
            // })
            // .catch(error => {
            //   this.logLine(this._eventsLog, `Error: ${error}`, true);
            // });          
          }
          if (feedObj.attacker == this._playerName && feedObj.victim != this._playerName && feedObj.is_victim_teammate == false) {
            this._killFeedSet.add(feedObj.attacker .victim);
          }
          this.logLine(this._eventsLog,  this._killFeedSet, false);
          if (this._killFeedSet.size == KILL_COUNT_FOR_ACE) {
            this.logLine(this._eventsLog, "ACE", false);
            fetch("http://192.168.1.133:5000/proxy", requestOptions)
            .then(response => {
              if (response.ok) {
                return response.json();
              } else {
                throw new Error(`HTTP error! Status: ${response.status}`);
              }
            })
            .then(data => {
              this.logLine(this._eventsLog, `API Response: ${data}`, true);
            })
            .catch(error => {
              this.logLine(this._eventsLog, `Error: ${error}`, true);
            });          
          }
        case 'death':
        case 'assist':
        case 'level':
        case 'matchStart':
        case 'match_start':
        case 'matchEnd':
        case 'match_end':
          return true;
      }

      return false
    });
    
    this.logLine(this._eventsLog, e, shouldHighlight);
  }

  // Displays the toggle minimize/restore hotkey in the window header
  private async setToggleHotkeyText() {
    const gameClassId = await this.getCurrentGameClassId();
    const hotkeyText = await OWHotkeys.getHotkeyText(kHotkeys.toggle, gameClassId);
    const hotkeyElem = document.getElementById('hotkey');
    hotkeyElem.textContent = hotkeyText;
  }

  // Sets toggleInGameWindow as the behavior for the Ctrl+F hotkey
  private async setToggleHotkeyBehavior() {
    const toggleInGameWindow = async (
      hotkeyResult: overwolf.settings.hotkeys.OnPressedEvent
    ): Promise<void> => {
      console.log(`pressed hotkey for ${hotkeyResult.name}`);
      const inGameState = await this.getWindowState();

      if (inGameState.window_state === WindowState.NORMAL ||
        inGameState.window_state === WindowState.MAXIMIZED) {
        this.currWindow.minimize();
      } else if (inGameState.window_state === WindowState.MINIMIZED ||
        inGameState.window_state === WindowState.CLOSED) {
        this.currWindow.restore();
      }
    }

    OWHotkeys.onHotkeyDown(kHotkeys.toggle, toggleInGameWindow);
  }

  // Appends a new line to the specified log
  private logLine(log: HTMLElement, data, highlight) {
    const line = document.createElement('pre');
    line.textContent = JSON.stringify(data);

    if (highlight) {
      line.className = 'highlight';
    }

    // Check if scroll is near bottom
    const shouldAutoScroll =
      log.scrollTop + log.offsetHeight >= log.scrollHeight - 10;

    log.appendChild(line);

    if (shouldAutoScroll) {
      log.scrollTop = log.scrollHeight;
    }
  }

  private async getCurrentGameClassId(): Promise<number | null> {
    const info = await OWGames.getRunningGameInfo();

    return (info && info.isRunning && info.classId) ? info.classId : null;
  }
}

InGame.instance().run();
