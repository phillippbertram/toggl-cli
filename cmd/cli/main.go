package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"phillipp.io/toggl-cli/internal/cmd"
)

func main() {

	err := godotenv.Load()
	if err != nil {
		log.Printf("Error loading .env file: %v\n", err)
	}

	rootCmd := cmd.NewCmdRoot()
	err = rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}
