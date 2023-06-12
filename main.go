package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
	"github.com/spf13/viper"
	"phillipp.io/toggl-cli/cmd"
)

func main() {

	_ = godotenv.Load()

	// setzt den erwarteten Pfad und Typ einer Config-Datei
	home, err := os.UserHomeDir()
	if err != nil {
		log.Fatalf("Error getting user home directory: %v", err)
	}
	viper.AddConfigPath(".")
	viper.AddConfigPath(home)
	viper.SetConfigType("yaml")
	viper.SetConfigFile(".config")

	rootCmd := cmd.NewCmdRoot()
	err = rootCmd.Execute()
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}
