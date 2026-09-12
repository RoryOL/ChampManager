package com.getcapacitor.myapp;

import static org.junit.Assert.*;

import org.junit.Test;

import ie.clare.champmanager.AppUpdatePlugin;

public class ExampleUnitTest {

    @Test
    public void addition_isCorrect() throws Exception {
        assertEquals(4, 2 + 2);
    }

    @Test
    public void githubUpdateUrlsAreAllowed() {
        assertTrue(
            AppUpdatePlugin.isAllowedUpdateUrl(
                "https://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk"
            )
        );
        assertTrue(
            AppUpdatePlugin.isAllowedUpdateUrl(
                "https://raw.githubusercontent.com/RoryOL/ChampManager/main/releases/version.json?t=1"
            )
        );
        assertFalse(AppUpdatePlugin.isAllowedUpdateUrl("https://evil.example/ChampManager.apk"));
        assertFalse(AppUpdatePlugin.isAllowedUpdateUrl("http://github.com/RoryOL/ChampManager/raw/main/releases/ChampManager.apk"));
    }
}
