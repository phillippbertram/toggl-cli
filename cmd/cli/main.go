package main

import (
	"os"

	"phillipp.io/toggl-cli/internal/cmd"
)

func main() {

	rootCmd := cmd.NewCmdRoot()
	err := rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}
