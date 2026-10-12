@echo off
setlocal

set DIRNAME=%~dp0
set APP_HOME=%DIRNAME%
set CLASSPATH=%APP_HOME%gradle\wrapper\gradle-wrapper.jar

if defined JAVA_HOME (
  set JAVA_EXE=%JAVA_HOME%\bin\java.exe
) else (
  set JAVA_EXE=java.exe
)

"%JAVA_EXE%" -version >NUL 2>&1
if errorlevel 1 (
  echo ERROR: Java was not found. Open this project in Android Studio and use its bundled JDK 17, or set JAVA_HOME. 1>&2
  exit /b 1
)

"%JAVA_EXE%" -Dfile.encoding=UTF-8 -Xmx64m -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
set EXIT_CODE=%ERRORLEVEL%
endlocal & exit /b %EXIT_CODE%
